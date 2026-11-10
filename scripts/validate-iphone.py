#!/usr/bin/env python3
"""Validate the installed pilot over USB; never install, download or change farmer data."""
import argparse
import datetime as dt
import json
import pathlib
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True)
parser.add_argument('--since', help='Read an already launched test started after this UTC ISO time')
parser.add_argument('--offline-confirmed', action='store_true', help='The operator has confirmed Wi-Fi and cellular data are off')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
output = root / '.private'
bundle = 'com.emmanuelhaggai.dairyos.local'


def run(arguments):
    result = subprocess.run(['xcrun', 'devicectl', 'device', *arguments[:2], '--device', args.device, '--timeout', '20', *arguments[2:]], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())


def launch(persistence=False, normal=False):
    started = dt.datetime.now(dt.timezone.utc)
    env = {'DAIRYOS_SELF_TEST': '0' if normal else '1', 'DAIRYOS_PERSISTENCE_TEST': '1' if persistence else '0', 'DAIRYOS_BLE_TEST': '0', 'DAIRYOS_BULB1_TEST': '0', 'DAIRYOS_RECONNECT_TEST': '0', 'DAIRYOS_SEMANTIC_TEST': '0', 'DAIRYOS_SEMANTIC_ACTUATE': '0', 'DAIRYOS_REVIEW_CHAT': '0'}
    run(['process', 'launch', '--terminate-existing', '--environment-variables', json.dumps(env), bundle])
    return started


def copy(name, destination):
    run(['copy', 'from', '--source', 'Documents/' + name, '--destination', str(destination), '--user', 'mobile', '--domain-type', 'appDataContainer', '--domain-identifier', bundle])


def report(name, started, destination):
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        try:
            copy(name, destination)
            value = json.loads(destination.read_text())
            captured = dt.datetime.fromisoformat(value['startedAt'].replace('Z', '+00:00'))
            if captured >= started - dt.timedelta(seconds=5):
                if value.get('failure'):
                    raise AssertionError(value['failure'])
                return value
        except (RuntimeError, FileNotFoundError, json.JSONDecodeError):
            pass
        time.sleep(3)
    raise TimeoutError('No fresh completed iPhone test report; old reports were not counted.')


started = dt.datetime.fromisoformat(args.since.replace('Z', '+00:00')) if args.since else launch()
acceptance = report('iphone-validation.json', started, output / 'iphone-validation-offline-final.json')
assert len(acceptance.get('models', [])) == 3 and all(row['matches'] for row in acceptance['models']), 'Model checksum validation missing'
print('Fresh native command/text/photo checks passed; all three model hashes match.', flush=True)
reopened = launch(persistence=True)
persistence = report('iphone-persistence-validation.json', reopened, output / 'iphone-persistence-validation.json')
print('Records and conversations survived terminating and reopening the app.', flush=True)
copy('inference-checks.json', output / 'iphone-inference-checks.json')
normal = launch(normal=True)
time.sleep(2)
copy('iphone-runtime-status.json', output / 'iphone-runtime-status.json')
assert json.loads((output / 'iphone-runtime-status.json').read_text())['selfTest'] is False, 'App did not return to normal mode'
result = {'networkConditions': 'Wi-Fi and cellular data disabled, as confirmed by the operator before the run; USB used for development only' if args.offline_confirmed else 'Not independently verified; do not count this run as offline acceptance', 'acceptanceStartedAt': acceptance['startedAt'], 'acceptanceCompletedAt': acceptance['completedAt'], 'acceptanceChecks': acceptance['passed'], 'persistenceChecks': persistence['passed'], 'normalModeLaunchedAt': normal.isoformat(), 'answers': [{'question': answer['question'], 'elapsedSeconds': round(answer.get('elapsedMs', 0) / 1000, 2), 'origin': answer.get('origin')} for answer in acceptance['answers']]}
(output / 'iphone-offline-acceptance.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2), flush=True)
