# Local semantic device assistant — 0.5.0 / build 14

> The 2B experiment below failed acceptance. See [LOCAL-AI-UPGRADE.md](LOCAL-AI-UPGRADE.md) for the 0.6.0 stronger-model candidate and its required on-device validation.

This supersedes the phrase router in 0.4.0. Chat device requests are interpreted by the installed Qwen3.5 2B model through QVAC, on the iPhone. No remote language service or phrase-matching fallback is used. The old `parseFarmChat` function has been removed.

## Request flow

1. Run local model inference on the current request first. If the model asks for clarification, run local inference again with the recent six conversation turns before presenting its final interpretation. This prevents earlier failed assistant replies from contaminating an explicit new request. The model resolves references such as “it”; no phrase matcher selects that branch.
2. The model receives a JSON capability schema in its prompt. Intent inference uses a bounded local reasoning budget (256 tokens) and a 512-token overall generation limit. The application validates the final JSON before using it. QVAC structured `responseFormat` was tested in non-reasoning mode; combining it with reasoning produced an empty final answer on this runtime, so the reasoning path does not constrain generation with that grammar. Do not put `json_schema` inside `generationParams`: the SDK rejects it.
3. Validate the output in `src/ble/semantic-intent.ts`. Invalid, interrupted or truncated interpretations cannot propose a command. Sensor values and success claims always come from application data, never model-generated measurements.
4. For device requests, initialize Bluetooth and attempt to obtain fresh telemetry. Scan for the DairyOS service, prefer the board selected during this app session, otherwise require exactly one nearby board. Multiple boards require selection in Devices. Permission denial, unavailable radio, cancellation, missing boards and connection timeouts return an error, without writing.
5. Commands open the same explicit confirmation as Devices. Only after confirmation does the application encode the allowlisted BLE command. Only the matching board acknowledgment records success. No automatic actuator retry.

## Capability schema

`intent`: command / sensors / status / clarify / none.
`target`: 0 (not specified/both for status), 1 or 2.
`state`: ON / OFF / unknown — logical bulb state.
`seconds`: bounded 1–30; default 10. The app's existing output policy maps normally-ON Bulb 1 correctly.
`metric`: temperature / humidity / both.
`clarification`: question from the model when information is missing.

The model interprets ordinary wording, capitalization and conversation references. It is a small probabilistic model: its interpretation can be wrong. The confirmation shows the interpreted bulb, state, duration and wiring before a write. Conditional automation, schedules, unsupported devices and multi-command requests are not supported.

The BLE service/characteristic UUIDs and binary requests are unchanged; see PROTOCOL.md. Arduino firmware changes are not required. Do not reflash the earlier uncommissioned reference sketch. Sensor values retain their original update time; a measurement becomes stale after five minutes without an update.

## Validation tools

- `scripts/check-semantic-model.ts`: real QVAC inference in a local Docker container with networking disabled. Saves results to `.private/semantic-model-results.json`.
- Explicit native launch flag `DAIRYOS_SEMANTIC_TEST=1`: real on-phone model cases, results in Documents/semantic-validation.json. Ordinary launches never run this.
- Additional `DAIRYOS_SEMANTIC_ACTUATE=1`: gated interactive Ask tests, short timed Bulb 1 OFF, follow-up ON, then disconnected automatic connection and capitalized ON. This changes real hardware and is for an authorized operator only.
- `DAIRYOS_REVIEW_CHAT=1` exports the local conversation for requested diagnostics. Treat the export as private; it is not included in server handoffs.

Model results and hardware results are separate. Passing a model test or a mocked transport test does not prove an electrical lamp changed. Long spontaneous-disconnection/headphone testing remains deferred.

## Observed limitation

The first real iPhone run correctly interpreted both reported failures (“turn it back on” after Bulb 1 OFF, and “Turn bulb 1 back on”), measured-condition wording, missing-referent clarification, negation, conditional requests and farming advice. It asked “Is the second light currently OFF?” for “Could you bring the second light back to life?” instead of proposing ON. This is retained as a conservative language limitation, not described as full arbitrary-language understanding. Model-generated clarification explanations can also be imperfect; they never write to the board.

## Validation by intent

Only fields relevant to an intent are execution inputs. A command requires target 1/2, ON/OFF and an integer hold of 1–30 seconds. A sensor request requires temperature/humidity/both. A status request requires target 0/1/2. Clarification requires a text question. Ordinary guidance has no hardware parameters. Irrelevant model metadata is ignored; for example a command's unused `metric: unknown` is not an invalid actuator request. This is distinct from accepting unknown targets, states or command durations, which remain rejected.

The JSON interpretation is never sent to the UNO Q. The phone maps validated logical bulb requests to the existing 20-byte BLE protocol and normally-ON output policy. Firmware and BLE UUIDs are unchanged.

## Separate local verification pass

A candidate command is checked by a second inference request on the same local model. This focused request classifies whether the current user authorizes one immediate bulb action, whether its reference is supported by conversation, and whether conditions/prohibitions/schedules make it unsupported. It reads the request and conversation without a candidate-action comparison, avoiding anchoring on the planner output. It uses a two-field approval response and a separate 96-token local reasoning budget. Approval describes permission, not the requested ON/OFF state. Both requests preserve actual chat roles; conversation is not embedded as a JSON payload. A rejection returns a clarification; it cannot reach command confirmation. Sensor/status interpretations are separately checked for actual measured-state requests; advice questions return to ordinary guidance.

This is model-based verification, not a phrase dictionary. It adds no remote service and holds only one model resident. A positive verification still requires a fresh BLE connection, human confirmation and a matching board acknowledgment. Model verification is probabilistic; it does not replace those application checks.
