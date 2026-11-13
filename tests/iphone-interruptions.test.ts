import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the production lifecycle methods with a fake application state and
// worker transport. No model or hardware command is started by this test.
test('iPhone interruption lifecycle preserves, resumes, expires and delivers requests once', { skip: process.platform !== 'darwin' }, () => {
  const source = readFileSync('native/iphone/DairyOSApp.swift', 'utf8');
  function method(name: string) {
    const start = source.indexOf(`func ${name}(`);
    assert.ok(start >= 0);
    const opening = source.indexOf('{', start);
    let depth = 1, end = opening + 1;
    while (depth && end < source.length) {
      if (source[end] === '{') depth++;
      if (source[end] === '}') depth--;
      end++;
    }
    return source.slice(start, end);
  }
  const folder = mkdtempSync(join(tmpdir(), 'dairyos-interruptions-'));
  try {
    const script = `
import Foundation
final class UIApplication {
  enum State { case active, inactive, background }
  static let shared = UIApplication()
  var applicationState = State.active
}
final class Harness {
  var activeID: String?
  var activeInput: [String: Any]?
  var pausedRequest: (id: String, input: [String: Any], deadline: Date)?
  var deferredReply: (id: String, type: String, value: Any)?
  var emitted: [(String, String)] = []
  var starts: [String] = []
  var stops = 0
  var idleRuntimeTimer: Timer?
  func releaseWarmRuntime() {}
  func emit(_ id: String, _ type: String, _ value: Any) { emitted.append((id, type)) }
  func write(_ object: [String: Any]) { stops += 1 }
  func startAnswer(_ id: String, _ input: [String: Any]) { starts.append(id) }
  ${method('background')}
  ${method('resumePendingRequest')}
}
let h = Harness()
h.activeID = "sensor"; h.activeInput = ["question": "temperature and humidity"]
UIApplication.shared.applicationState = .background
h.background()
assert(h.stops == 1 && h.pausedRequest?.id == "sensor")
h.resumePendingRequest(); assert(h.starts.isEmpty)
UIApplication.shared.applicationState = .active
h.resumePendingRequest(); assert(h.starts.isEmpty) // Old worker must finish first.
h.activeID = nil
h.resumePendingRequest(); h.resumePendingRequest()
assert(h.starts == ["sensor"] && h.pausedRequest == nil)
h.pausedRequest = ("expired", [:], Date().addingTimeInterval(-1))
h.resumePendingRequest()
assert(h.starts.count == 1 && h.emitted.last?.0 == "expired" && h.emitted.last?.1 == "error")
h.deferredReply = ("completed", "result", [:])
h.resumePendingRequest(); h.resumePendingRequest()
assert(h.starts.count == 1 && h.emitted.filter { $0.0 == "completed" }.count == 1)
print("Lifecycle assertions passed")
`;
    const path = join(folder, 'lifecycle.swift');
    writeFileSync(path, script);
    const result = spawnSync('swift', [path], { encoding: 'utf8', env: { ...process.env, CLANG_MODULE_CACHE_PATH: join(folder, 'cache') } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
