#!/usr/bin/env python3
"""Transfer the public, verified temporary model pack over bounded parallel SSH streams."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parent.parent
CHUNK = 32 * 1024 * 1024
START_LOCK = threading.Lock()
LAST_START = 0.0

def sha(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()

def fetch_part(model, index):
    global LAST_START
    target = ROOT / '.private' / 'model-chunks' / model['file'] / str(index)
    target.parent.mkdir(parents=True, exist_ok=True)
    size = min(CHUNK, model['bytes'] - index * CHUNK)
    if target.exists() and target.stat().st_size == size:
        return target
    remote = '/tmp/dairyos-local-model-staging/models/' + model['file']
    for attempt in range(3):
        offset = target.stat().st_size if target.exists() else 0
        if offset > size:
            target.unlink()
            offset = 0
        command = f'dd if={shlex.quote(remote)} bs=1048576 iflag=skip_bytes,count_bytes skip={index * CHUNK + offset} count={size - offset} status=none'
        # Stagger connection starts to stay below sshd's unauthenticated-startup burst limit.
        with START_LOCK:
            time.sleep(max(0, LAST_START + 0.25 - time.monotonic()))
            LAST_START = time.monotonic()
        with target.open('ab' if offset else 'wb') as output:
            try:
                result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'contabo', command], stdout=output, stderr=subprocess.PIPE, timeout=1800)
                error = result.stderr.decode(errors='replace')[-300:]
            except subprocess.TimeoutExpired:
                result = None
                error = 'Slow SSH stream timed out; partial bytes retained for resume.'
        if result is not None and result.returncode == 0 and target.stat().st_size == size:
            return target
        if attempt == 2:
            raise RuntimeError('SSH chunk transfer failed: ' + error)
        time.sleep(1)

if __name__ == '__main__':
    manifest = json.loads((ROOT / 'models' / 'manifest.json').read_text())
    models = sorted(manifest['models'], key=lambda model: model['bytes'])
    for model in models:
        destination = ROOT / 'models' / model['file']
        if destination.exists() and destination.stat().st_size == model['bytes'] and sha(destination) == model['sha256']:
            print('Already verified ' + model['file'], flush=True)
            continue
        count = (model['bytes'] + CHUNK - 1) // CHUNK
        with concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get('DAIRYOS_MODEL_TRANSFER_WORKERS', '24'))) as pool:
            jobs = [pool.submit(fetch_part, model, index) for index in range(count)]
            for completed, _ in enumerate(concurrent.futures.as_completed(jobs), 1):
                _.result()
                print(f"{model['file']}: {completed}/{count} chunks", flush=True)
        incoming = destination.with_suffix('.gguf.incoming')
        with incoming.open('wb') as output:
            for index in range(count):
                part = ROOT / '.private' / 'model-chunks' / model['file'] / str(index)
                with part.open('rb') as stream:
                    for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                        output.write(block)
        if incoming.stat().st_size != model['bytes'] or sha(incoming) != model['sha256']:
            raise RuntimeError('Staged model checksum mismatch; no model promoted: ' + model['file'])
        incoming.replace(destination)
        print('Verified ' + model['file'], flush=True)
        for index in range(count):
            (ROOT / '.private' / 'model-chunks' / model['file'] / str(index)).unlink()
