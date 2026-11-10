"""UNO Q single-writer service. Settings/token remain on the board, never iPhone."""
import json
import logging
import os
import socketserver
import threading
import time
import urllib.request
from coordinator import Coordinator


class API:
    def __init__(self, base, token):
        if not base.startswith('https://'):
            raise ValueError('HTTPS required')
        self.base, self.token = base.rstrip('/'), token
    def request(self, name, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(self.base + '/' + name, data=data, headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json', 'User-Agent': 'DairyOS-UNO-Q/2.0'})
        with urllib.request.urlopen(request, timeout=8) as response:
            result = json.load(response)
        if result.get('ok') is not True:
            raise RuntimeError('Gateway API rejected request')
        return result
    def local_command(self, payload): return self.request('local-command', payload)
    def poll(self): return self.request('outputs')
    def acknowledge(self, payload): return self.request('acknowledge', payload)


def main():
    from arduino.router_bridge import Bridge
    logging.basicConfig(level=logging.INFO)
    with open('/etc/dairyos-output/settings.json') as f:
        config = json.load(f)
    bridge = Bridge()
    if not bridge.connect(timeout=5): raise RuntimeError('MCU bridge unavailable')
    coordinator = Coordinator('/var/lib/dairyos-output/state.sqlite3', bridge)
    api = API(config['api_base'], config['token'])
    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            try:
                data = self.rfile.readline(1025)
                if len(data) > 1024: raise ValueError('Request too large')
                value = json.loads(data)
                if value['command'] == 'pending': result = coordinator.pending()
                elif value['command'] == 'set': result = coordinator.local(value['target'], value['opcode'], value['seconds'])
                else: raise ValueError('Unknown request')
                reply = {'ok': True, 'result': result}
            except Exception:
                logging.exception('Local output request failed')
                reply = {'ok': False, 'error': 'Output not confirmed; do not retry automatically.'}
            self.wfile.write((json.dumps(reply)+'\n').encode())
    path = '/run/dairyos-output/control.sock'
    if os.path.exists(path): os.unlink(path)
    server = socketserver.ThreadingUnixStreamServer(path, Handler)
    os.chmod(path, 0o660)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    def timers():
        while True:
            try: coordinator.expire_timers()
            except Exception: logging.exception('Timer reconciliation failed')
            time.sleep(0.2)
    threading.Thread(target=timers, daemon=True).start()
    while True:
        try: coordinator.cycle(api)
        except Exception: logging.warning('Cloud sync unavailable; retaining local state and queue.')
        time.sleep(5)

if __name__ == '__main__': main()
