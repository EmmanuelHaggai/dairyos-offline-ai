# Validation plan and results

## Required software checks

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run export:web`, and `npm run export:ios`. Run native prebuild to verify QVAC worker/plugin bundling. Software checks do not validate native inference.

Tests cover malformed records and dates, deterministic totals, English/Kiswahili retrieval, unknown questions, bounded history, remote model-source rejection, sequential vision/text model residency, cleanup failures and cancellation during loading.

## Desktop acceptance

1. Preview loads at 390 px and desktop widths; all four tabs are usable.
2. Add records, reload, and confirm exact values/dates persist. Delete a record and confirm recalculated context.
3. Read the six built-in reference cards without AI. Add/search/delete a local note. Verify irrelevant searches do not invent results.
4. With staged models and compatible local runtime, ask a reference-based question. Confirm a real QVAC result and measured latency, not a placeholder.
5. Ask about yesterday's milk after entering only yesterday's data. It must not call that today's production.
6. Try English and Kiswahili, a question outside the library, adversarial record notes and an unsupported device command.
7. Choose a local farm photo. Check the separate unverified visual description and final guidance against the photo. Repeat with blur, darkness and unrelated content.
8. Stop during loading/generation. Start another request and confirm native resources were released.

## iPhone acceptance

Install a signed Release build, stage all models and locally available photos, then close the app, enable airplane mode and explicitly switch Wi-Fi off. Reopen and repeat the desktop scenarios. Confirm there is no model fetch, server login, provider request or Metro dependency.

Record model SHA-256, device OS, answer text, correctness, first generation token, full latency, memory pressure/termination, heat and battery change. Run at least five successive text requests and three photo requests, plus app-background/cancel/restart checks. Check records and reference material after a phone/app restart.

Use farmer photos representing intended species/crops, healthy examples, common problems, confusing lookalikes, poor lighting and unsupported cases. Keep identifiable people and unnecessary private content out of the test set. A small curated test set is not evidence of diagnostic accuracy. Review guidance with an agricultural/veterinary professional before field deployment.

## Build environment observed

- Mac: Intel x86_64, macOS 13.7.8, Xcode 15.2.
- System Node: 22.14.0; project-local Node: 22.22.0.
- QVAC: pinned 0.22.0. Expo: SDK 54 / React Native 0.81.
- Phone detection and current software-check results are recorded below as work proceeds.

## Results

### Interface 0.2 update

- Official DairyOS website wordmarks and mark, color tokens and an opaque app icon are bundled locally. Wireframes, mockups, implementation screenshots, research and the detailed review are in `docs/design/`.
- Twenty-five domain/lifecycle checks, TypeScript and lint pass. The existing 22-flow browser test passes with the updated form and accessible icon selectors. Separate real-QVAC runs completed standalone English generation and the photo attachment/guidance flow.
- Rendered review passed at 320, 390, 428, 768 and 1280 px: no document overflow, undersized targets, duplicate IDs or runtime exceptions. All 638 sampled rendered text checks passed contrast thresholds. This is a sampled audit, not complete WCAG certification.
- Version 0.2.0, build 3 compiled and installed over the existing iPhone app. After developer verification and the user confirming Wi-Fi/cellular data off, all 15 native checks plus four restart/persistence checks passed. All three model hashes matched; text guidance completed in 9.22 s, and the sample photo safely returned the local inspection guide after rejecting its assessment (1.03 s). The app was left open in normal mode. Native results: `.private/ui-iphone-acceptance.log`; browser/photo results: `.private/ui-browser-check.log` and `.private/ui-photo-browser-check.log`.

### Earlier inference groundwork

- TypeScript and lint passed after the app, desktop runner and photo-retrieval changes.
- Domain/lifecycle tests include a local-date regression so the phone's current day is preserved when testing in a UTC container. Inference lifecycle tests use a fake SDK and do not establish model quality.
- Browser checks passed at 390 px: local records saved and survived reload, Kiswahili reference retrieval worked, unmatched searches returned no result, a local note was saved, all tabs worked, and there were no browser runtime exceptions. Screenshots and results: `.private/browser-check/`.
- QVAC native prebuild succeeded: selected LLM plugin bundle generated and verified; iOS native addons linked.
- iOS JavaScript/Hermes export succeeded (native compile/sign/install not performed).
- Native macOS QVAC worker probe timed out. A local Linux Docker QVAC worker successfully ran real text and image inference with `--network none`.
- Two public PlantVillage research leaf images are staged under `.private/photo-checks/`, with original source URLs and dataset labels in `sources.json`. These are controlled research images, not representative field validation.
- Real VisionPsy Flash inference completed on both public leaf images inside a local Docker CPU container with `--network none`. Initial native first-token times were about 5.1–5.6 seconds, with about 17–23 generated tokens/second. These are desktop CPU figures, not iPhone performance.
- The initial photo prompt guessed a species incorrectly (a tomato dataset leaf was suggested to be mint). The shared photo prompt was tightened to request directly visible observations and prohibit species/disease guesses. Two retests did not name a species, but their descriptions remained basic and included unhelpful wording. This does not establish reliable crop identification or diagnosis. Baseline and revised transcripts: `.private/model-check/vision.json` and `vision-v2.json`.
- All three model files are staged locally and matched their pinned sizes and SHA-256 checksums. The temporary public-model files on Contabo were removed; no production service or farm data was changed.
- The initial English record answer correctly reported 20 L and unknown current production. A later higher-temperature test hallucinated 37.5 L from 12.5 + 7.5 and invented app menus. Saved-record answers now bypass the model and use calculated totals; automated checks cover old dates, named animals, zero vs missing, and the observed arithmetic failure.
- Kiswahili generation failed both baseline and revised sampling tests. A further Kiswahili-input/English-output trial was rejected by the repetition guard. English-only generated guidance is explicitly labelled in the app. Kiswahili reference keyword retrieval remains available. Failed transcripts are retained in `.private/model-check/results-baseline.json` and `results-high-sampling.json`.
- The corrected supported-case trial returned the exact 20 L saved total without loading a model, completed a coherent English milking-guidance answer (~65 s on this computer), and completed the guarded two-stage leaf-photo flow (~87 s). Photo observations were still basic and missed visible detail; this is pipeline validation, not disease-detection validation. Results: `.private/model-check/results.json`. That diagnostic run returned nonzero because it also deliberately included the unsupported Kiswahili case; it is not an all-capabilities pass.
- Twenty-five domain/lifecycle tests pass, including observed false photo-health/absence claims, reference fallback, short commands, unknown animal names and preventing model arithmetic. Full browser inference checks passed before the final photo changes; the final interface also passed all four tabs at 320, 390, 428, 768 and 1280 px, command replies, visible invalid-input errors and confirmed deletion. Reports: `.private/browser-check/result-full-inference.json` and `.private/browser-command-check.log`. A repeat full browser inference attempt hit a Chrome debugging-protocol timeout and does not count as a pass.
- The SwiftUI resource diagnostic compiled and ran on the iPhone; measured resources are in `docs/IPHONE-RESOURCES.md`.
- The additional SwiftUI/WKWebView native shell compiled with Xcode 15.2, installed using the existing Personal Team, and ran real native QVAC inference. The original Expo build still requires a newer Xcode toolchain. The native shell uses the same interface and inference engine with `@qvac/inference` inside Bare, and stores data in on-device WebKit storage. Tests use an isolated namespace.
- Initial native acceptance completed without a test failure: records, invalid-date errors, Kiswahili reference retrieval, phone layout, eight immediate local command responses, English generation (~32.7 s), and the two-stage leaf flow (~13.2 s). A refined run also verified all three SHA-256 hashes on the phone. These results prove execution, not reliable visual guidance: photo outputs missed visible leaf marks and made unsupported absence claims. Those transcripts are retained in `.private/iphone-validation-baseline.json` and `.private/iphone-validation-refined.json`.
- After the user disabled Wi-Fi and cellular data, a fresh app launch completed English native generation (~9.9 s), records/command checks and model checksums. Its photo assessment was correctly rejected by the health-claim guard, so that run is not an all-capabilities pass. Result: `.private/iphone-validation-offline.json`.
- The final implementation replaces rejected photo assessments with clearly labelled local inspection guidance. Twenty-five automated checks cover this fallback, including both early vision rejection and a rejected final answer. Photo guidance is buffered until these checks pass. No new field-image accuracy claim is made.
- **Final offline phone acceptance passed**, after the user verified the newly signed build and again disabled Wi-Fi and cellular data. The fresh run was 2026-10-30 06:56:32–06:57:03 UTC. All 15 native checks passed, including local records, invalid-input errors, Kiswahili reference retrieval, layout, immediate command replies, all three on-device SHA-256 hashes, English native generation (8.84 s) and a photo request (14.61 s). The last photo answer followed the model path and provided uncertain observations and inspection steps; it did not exercise the reference fallback. Results: `.private/iphone-validation-offline-final.json`.
- Four additional restart checks passed: all three milk/feed records restored, exact quantities preserved, conversation restored and stored records rendered offline. Tests used an isolated namespace. The app was then launched in normal mode, confirmed by the native runtime status. Final summary: `.private/iphone-offline-acceptance.json`; persistence report: `.private/iphone-persistence-validation.json`; native sampled-memory evidence: `.private/iphone-inference-checks.json`.
- The final desktop interface passed 22 browser checks, including all four tabs at five widths, normal and unsupported commands, invalid-input recovery, record persistence/deletion and no browser runtime exceptions. Latest report: `.private/browser-final-commands.log`. This final browser run deliberately did not repeat model inference; the final shared engine was exercised on the phone instead.
- Battery drain, prolonged thermal behavior, field-photo accuracy, camera permissions/capture and the full five-text/three-photo soak acceptance remain unvalidated. USB-powered short runs cannot establish field battery life.

## BLE implementation — 30 October 2026

Version 0.3.0 (build 4) adds native CoreBluetooth in the installed iPhone shell and a Devices screen matching the production temperature/humidity and two bulb output keys. Production source was read-only inspected; no server state was changed.

- 30 TypeScript tests passed, including five BLE codec / simulator tests.
- Five Python UNO Q protocol tests passed: matching wire fixture, replay rejection, malformed command rejection, interlock rejection and Bridge failures.
- 15 automated BLE browser checks passed: unknown readings, disabled controls without a board, explicit simulation labels, reviewed ON/cancel, independent output state, OFF, disconnect invalidation and 320/390/428/768/1280px layouts with minimum 44px controls. See `docs/ble/ui-validation.json`.
- TypeScript typecheck, ESLint and the signed iPhone build passed. The update was installed over the existing bundle without uninstalling or recopying models.
- iPhone regression at 09:29:51–09:30:10 UTC passed 15 checks and four persistence checks; all three model SHA-256 hashes matched. Text guidance took 9.38s. Photo assessment took 1.07s and correctly fell back to the local guide. Network state was not independently checked for this run; it is not new offline-network acceptance.
- The iOS BLE central, permission string, scan filter, characteristic discovery/subscription and acknowledged-write code compile against CoreBluetooth. Foreground inference is still cancelled on resign-active; BLE disconnect happens on actual background entry so the system pairing dialog can complete.

No physical UNO Q was identified or connected in this session. Radio pairing/notifications, UNO Q sketch compilation, sensor accuracy, actual relay polarity, physical run limits and electrical bulb feedback remain hardware acceptance items. Computer simulation must not be counted as hardware success. See `firmware/uno-q/README.md` for commissioning and failure trials. The reference MCU sketch leaves actuation disabled until explicitly commissioned.

## BLE telemetry recovery and retention — 0.3.1 build6

Read-only live diagnosis captured native `CBATTErrorDomain15: Encryption is insufficient` on the initial read, followed by valid20-byte notifications with27.6°C and64%RH. A later packet reported sensor-valid=false. The app now distinguishes read errors from bad packets, clears transient errors on valid telemetry and preserves the last measured temperature/RH and receipt timestamp. The user confirmed values/timestamp are visible. No equipment commands were issued. Authentication for protected writes is still required.

34 TypeScript tests,18 browser checks and native Swift telemetry classifier checks pass; typecheck/lint and signed iPhone build pass. Tests include real captured frame fixtures, retention through invalid sensor frames, unchanged last-updated time, stale display after five minutes, and six-second actuation freshness. Native15-second reconnect recovery compiles; a physical forced-radio-loss test has not been performed. Existing QVAC inference/records were not changed in this patch.

Final installed build6 live check: from11:37:41–11:38:25 UTC, iPhone remained connected to the commissioned UNO Q and received44 telemetry notifications. Recorded packets contained valid measured temperature/RH (approximately27.1–27.9°C and63–64%RH). Initial encrypted read still returns native error15, so authenticated protected writes remain a board/iPhone pairing step; notifications recover and render through the app decoder. No actuation requests were issued. Final handoff: `/var/www/DairyOS/docs/dairyos-local-ble-0.3.1-build6/` and matching tar.gz on the server.
