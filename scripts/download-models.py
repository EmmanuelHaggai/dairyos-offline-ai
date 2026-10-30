#!/usr/bin/env python3
"""Stage pinned models on the development computer, never on a field-use startup path."""
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()

def download(model):
    destination = ROOT / 'models' / model['file']
    if destination.exists() and destination.stat().st_size == model['bytes'] and digest(destination) == model['sha256']:
        print(f"Verified existing {destination.name}", flush=True)
        return
    partial = destination.with_suffix('.gguf.part')
    for attempt in range(3):
        try:
            offset = partial.stat().st_size if partial.exists() else 0
            if offset > model['bytes']:
                partial.unlink()
                offset = 0
            request = urllib.request.Request(model['url'], headers={'User-Agent': 'DairyOS-local-model-stager/0.1', **({'Range': f'bytes={offset}-'} if offset else {})})
            with urllib.request.urlopen(request, timeout=45) as response:
                if offset and response.status != 206:
                    offset = 0
                written = offset
                last_report = 0
                with partial.open('ab' if offset else 'wb') as output:
                    while True:
                        chunk = response.read1(256 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                        written += len(chunk)
                        if written > model['bytes']:
                            raise RuntimeError('Download exceeds pinned model size')
                        if time.monotonic() - last_report > 15:
                            print(f"{destination.name}: {written / model['bytes']:.0%}", flush=True)
                            last_report = time.monotonic()
            if partial.stat().st_size != model['bytes']:
                raise RuntimeError(f"Incomplete transfer: {partial.stat().st_size} of {model['bytes']} bytes; will resume")
            if digest(partial) != model['sha256']:
                partial.unlink()
                raise RuntimeError('Model checksum or size mismatch')
            with partial.open('rb') as stream:
                if stream.read(4) != b'GGUF':
                    raise RuntimeError('Not a GGUF model')
            partial.replace(destination)
            print(f"Verified {destination.name}", flush=True)
            return
        except Exception as error:
            print(f"Attempt {attempt + 1}: {destination.name}: {error}", flush=True)
            if attempt == 2:
                raise
            time.sleep(2)

if __name__ == '__main__':
    manifest = json.loads((ROOT / 'models' / 'manifest.json').read_text())
    for entry in manifest['models']:
        download(entry)
