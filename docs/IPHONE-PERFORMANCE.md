# Faster local AI — build 24

The iPhone shell prepares the text model after its interface opens and retains
it while the app remains open in the foreground. Requests arriving during
preparation wait for the same worker rather than allocating a second model.
Follow-ups reuse weights while `kvCache: false` gives each completion fresh
request context. Prompt interpretation, independent authorization, and Bluetooth
acknowledgment checks are unchanged.

The Ask screen's **Temperature & humidity** shortcut opens Devices. That screen
reads Bluetooth telemetry directly and works without an AI model. It keeps the
existing unknown/stale/fresh distinctions and does not invent measurements.

Backgrounding unloads an idle model and closes the runtime; memory warnings release an idle model
and prevent retaining the active request's runtime. Automatic preparation is
skipped in Low Power Mode, serious thermal conditions, and operator tests.
Photo requests unload cached text before loading vision, then may retain text
again after guidance. Stop/errors discard a model used by interrupted inference.
The three-minute background interruption behavior remains in place.

## Validation

Unit tests exercise preparation without generation, reuse over repeated
requests, fresh completion context, photo model switching, and cache cleanup on
errors. The native iPhone diagnostic interprets the same temperature/humidity question
three times, then runs interpretation and answer generation for “hello” and a
simple milking-hygiene question. It records cold versus reused-model latency,
first-token time, and generation time for each pass. It never sends an equipment
command. Every accepted conversational result must report `origin: model`.

To run it after installing build 24 (use the phone Identifier from
`xcrun devicectl list devices`):

```bash
xcrun devicectl device process launch --terminate-existing \
  --device PHONE_IDENTIFIER \
  --environment-variables '{"DAIRYOS_PERFORMANCE_TEST":"1"}' \
  com.emmanuelhaggai.dairyos.local
xcrun devicectl device copy from --device PHONE_IDENTIFIER \
  --source Documents/performance-validation.json \
  --destination .private/performance-validation.json \
  --user mobile --domain-type appDataContainer \
  --domain-identifier com.emmanuelhaggai.dairyos.local
```

Wait for a fresh `completedAt`. Acceptance requires `passed: true`,
`controlWrites: 0`, the first sensor result with `reusedModel: false`, and subsequent results with `reusedModel: true`.
Compare `elapsedMs`, `firstTokenMs`, and `modelLoadMs`; do not treat desktop mocks
as a speed measurement. Restore normal mode afterward:

```bash
xcrun devicectl device process launch --terminate-existing \
  --device PHONE_IDENTIFIER \
  --environment-variables '{"DAIRYOS_PERFORMANCE_TEST":"0"}' \
  com.emmanuelhaggai.dairyos.local
```

On-phone latency, repeated-load stability, background release, memory-pressure
behavior, and notification/screen-recording acceptance remain pending until
verified on the installed build. Warm weights remove reload work; they do not
remove the model's prompt processing and token generation costs.

Implementation check on 13 November 2026: build 21 compiled, signed, and installed
as an update on the connected iPhone 13 Pro Max. All 53 automated tests,
TypeScript checking, and lint passed. The local app signature verified. iOS
rejected the diagnostic launch with a security/developer-trust error, so no
cold/warm phone timings are claimed. Resolve developer trust on the phone and
run the diagnostic above before treating performance as accepted.

Build 22 keeps the model ready for the foreground session, with no idle timeout.
Backgrounding releases an idle model; active requests retain the existing
three-minute pause/resume window. Memory warnings release an idle model and
prevent retaining the active request's runtime. iOS may terminate the app under
memory pressure, so readiness cannot be guaranteed indefinitely.

Build 22 compiled and installed on 13 November 2026 with no foreground idle
expiry. Normal launch succeeded, and the native interruption regression test
passed. A read-only performance launch did not produce a completed report;
no cold/warm timing improvement is claimed from that attempt. The app was
returned to normal mode afterward.

Build 23 removes the old canned conversational reply module from both phone and
desktop inference routes. Greetings, help, weather questions, and unsupported
requests all go through the local model. Record totals are still computed by
code and supplied as model context; the conversational response is generated.
Explicit error messages, equipment receipts, and offline source references
remain distinguishable from model-generated answers. The model's reasoning
budget stays zero; intent interpretation and independent authorization checks
are measured as inference passes, not as hidden thinking time.

## Actual iPhone measurements — build 24, 13 November 2026

All seven native inference checks passed; `controlWrites` was zero. Full
synthetic-question evidence is in [the recorded report](ble/performance-validation-build24.json).
The preceding build 23 attempt completed a cold sensor request but failed its
next model initialization. Build 24 explicitly waits for QVAC cleanup before
terminating a worker; the subsequent cold and six reused-model requests passed.
This is a short-run validation, not a long-term stability guarantee.

| Request | Interpretation | Verification / answer | Total |
| --- | ---: | ---: | ---: |
| Sensor, cold | 13.4 s | 8.0 s verification | 25.4 s including 3.4 s loading and host overhead |
| Sensor, warm repeat 1 | 13.2 s | 8.1 s verification | 21.3 s |
| Sensor, warm repeat 2 | 13.5 s | 10.3 s verification | 23.7 s |
| Hello, warm | 14.3 s | 13.4 s answer | 27.7 s |
| Milking hygiene, warm | 15.3 s | 26.6 s answer | 41.8 s |

Sensor savings were 1.7–4.1 seconds (about 7–16%), averaging 2.9 seconds in these
two repeats. Warm model loading was zero. The sensor totals exclude Bluetooth
connection/read time. Hello and guidance totals sum the two native requests used
by Ask and exclude small UI scheduling costs; first visible answer tokens would
arrive at approximately 23.6 and 30.6 seconds respectively. These are observed
samples, not guaranteed latency or statistical benchmarks.

The generated hello response was: “Hello! No farm records entered yet. Can you
confirm if you're managing a crop, livestock, or both? (e.g., maize, cows)”. Both
it and the generated milking guidance recorded `origin: model` and nonzero token
counts. There was no canned greeting or help fallback. Reasoning budget was zero;
reported interpretation and verification durations are actual model generation
passes, not a measured hidden chain of thought. Background model reuse, peak
profiling, and prolonged thermal/battery testing remain outside this check.
