"""Single writer for BLE and cloud outputs. No network work holds the GPIO lock.
Integrate with commissioned DHT11 firmware; never replace its sensor implementation.
"""
import sqlite3
import threading
import time
import uuid


class Coordinator:
    def __init__(self, path, bridge):
        self.bridge = bridge
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS output (target INTEGER PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
            generation INTEGER NOT NULL DEFAULT 0, event TEXT, state TEXT, status TEXT, expires REAL);
          CREATE TABLE IF NOT EXISTS outbox (event TEXT PRIMARY KEY, target INTEGER NOT NULL, state TEXT NOT NULL);
          INSERT OR IGNORE INTO output(target) VALUES(1),(2);
        ''')
        # Never replay an uncertain hardware call after a crash.
        self.db.execute("UPDATE output SET status='uncertain' WHERE status='prepared'")

    def pending(self):
        with self.lock:
            return bool(self.db.execute('SELECT 1 FROM outbox LIMIT 1').fetchone() or
                        self.db.execute("SELECT 1 FROM output WHERE status IN ('prepared','uncertain') LIMIT 1").fetchone())

    def _transaction(self, work):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            result = work()
            self.db.execute('COMMIT')
            return result
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def local(self, target, opcode, seconds):
        if type(target) is not int or type(opcode) is not int or target not in (1, 2) or opcode not in (0, 1, 2) or not isinstance(seconds, int) or isinstance(seconds, bool) or not 0 <= seconds <= 30 or (opcode == 1) != (seconds > 0):
            raise ValueError('Invalid local command')
        state = 'OFF' if opcode == 0 else 'ON'  # raw relay, never display inversion
        with self.lock:
            event = uuid.uuid4().hex
            expires = time.time() + seconds if opcode == 1 else None
            # Commit intent BEFORE touching hardware. A crash cannot expose old cloud state.
            self.db.execute("UPDATE output SET generation=generation+1,event=?,state=?,status='prepared',expires=? WHERE target=?", (event, state, expires, target))
            try:
                result = self.bridge.call('dairyos_latch', target, state == 'ON', timeout=1) if opcode == 2 else self.bridge.call('dairyos_set', target, seconds, timeout=1)
                if not result:
                    raise RuntimeError('MCU rejected command')
                def commit():
                    self.db.execute('INSERT INTO outbox VALUES(?,?,?)', (event, target, state))
                    self.db.execute("UPDATE output SET status='applied' WHERE target=?", (target,))
                self._transaction(commit)
                return True
            except BaseException:
                self.db.execute("UPDATE output SET status='uncertain' WHERE target=?", (target,))
                raise

    def expire_timers(self):
        # MCU enforces timer independently, even if Linux crashes. Record expiry as a
        # new local command so the cloud cannot later re-energize an expired hold.
        with self.lock:
            rows = self.db.execute("SELECT target FROM output WHERE expires IS NOT NULL AND expires<=? AND status='applied'", (time.time(),)).fetchall()
            for (target,) in rows:
                self.local(target, 0, 0)

    def cycle(self, api):
        self.expire_timers()
        # Flush durable events before ANY cloud polling; retry network requests with
        # the same idempotency key, never repeat the hardware action.
        while True:
            with self.lock:
                row = self.db.execute('SELECT event,target,state FROM outbox ORDER BY rowid LIMIT 1').fetchone()
            if not row:
                break
            event, target, state = row
            receipt = api.local_command({'event_id': event, 'output_key': f'bulb_{target}', 'state': state})
            revision = receipt.get('revision')
            if receipt.get('output_key') != f'bulb_{target}' or receipt.get('state') != state or type(revision) is not int or revision < 1:
                raise ValueError('Mismatched sync receipt')
            with self.lock:
                def commit():
                    self.db.execute('UPDATE output SET revision=MAX(revision,?) WHERE target=?', (revision, target))
                    self.db.execute('DELETE FROM outbox WHERE event=?', (event,))
                self._transaction(commit)
        with self.lock:
            if self.pending():
                return
            generations = dict(self.db.execute('SELECT target,generation FROM output'))
        reply = api.poll()  # BLE can arrive while HTTP is in flight.
        for item in reply['outputs']:
            if item.get('output_key') not in ('bulb_1', 'bulb_2') or item.get('desired_state') not in ('ON', 'OFF') or type(item.get('revision')) is not int:
                raise ValueError('Invalid cloud output')
            target = int(item['output_key'][-1])
            with self.lock:
                revision, generation, status, expires = self.db.execute('SELECT revision,generation,status,expires FROM output WHERE target=?', (target,)).fetchone()
                if self.pending() or generation != generations[target] or item['revision'] <= revision:
                    continue  # stale response, equal revision, or local change wins
                # Equal-revision echoes were rejected above. A genuinely newer
                # online instruction supersedes even an earlier explicit timer.
                state = item['desired_state']
                # Record floor before RPC: a failed/uncertain write is NOT retried.
                self.db.execute("UPDATE output SET revision=?,generation=generation+1,state=?,status='uncertain',expires=NULL WHERE target=?", (item['revision'], state, target))
                result = self.bridge.call('dairyos_latch', target, state == 'ON', timeout=1)
                if not result:
                    raise RuntimeError('MCU rejected cloud command')
                self.db.execute("UPDATE output SET status='applied' WHERE target=?", (target,))
            # A later BLE action may race this ACK, so the server revision is exact;
            # older ACKs cannot confirm the later command.
            api.acknowledge({'outputs': [{'output_key': item['output_key'], 'state': state, 'revision': item['revision']}]})
        # Confirm the synchronized local revision only from a current MCU snapshot.
        with self.lock:
            if self.pending():
                return
            raw = str(self.bridge.call('dairyos_snapshot', timeout=1)).split(',')
            if len(raw) != 6:
                raise ValueError('Bad MCU snapshot')
            reports = []
            for target, revision, state, status in self.db.execute('SELECT target,revision,state,status FROM output'):
                actual = 'ON' if int(raw[target+2]) else 'OFF'
                if status == 'applied' and revision:
                    reports.append({'output_key': f'bulb_{target}', 'state': actual, 'revision': revision})
        if reports:
            api.acknowledge({'outputs': reports})
