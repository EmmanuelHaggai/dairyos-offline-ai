# DairyOS Local — offline iPhone pilot

Scope: QVAC text inference, local farm records/reference retrieval, farm-photo guidance, and foreground BLE sensor readings / explicit timed bulb controls. Cloud sync, speech and continuous automation are deferred.

## DairyOS interface 0.2

The app now uses the website's official logo, forest/green/lime palette, a persistent question composer, labeled bottom navigation on phones and a forest sidebar on wider screens. Record forms have visible labels, library guides have working topic filters and expandable sources, and setup details are grouped by task. All branding is bundled for offline use.

While the local preview is running, open the [wireframes](http://127.0.0.1:8786/design/wireframes.html) or [branded mockups](http://127.0.0.1:8786/design/mockups.html). The [design review](docs/design/DESIGN.md) includes research sources, decisions, corrections and measured results. Rendered implementation screens and a JSON audit are under `docs/design/`.

## Develop and validate on the computer first

The browser preview uses the same prompts, retrieval and inference engine as the native app. Preview records are stored in this browser. The computer-compatible iPhone shell uses persistent on-device WebKit storage; the original Expo build uses SQLite. These stores are independent.

```sh
export PATH="$PWD/.tools/node_modules/node/bin:$PATH"
npm install
npm run typecheck
npm run lint
npm test
node scripts/prepare-models.mjs
python3 scripts/download-models.py
npm run export:web
npm run preview
```

Open `http://127.0.0.1:8786`. The local server binds to loopback and rejects foreign origins. It serves the preview and runs QVAC on this computer. It never calls Contabo or an external inference provider. Its model staging script is a separate development-only network operation. Native package installation also needs connectivity.

QVAC documents macOS 14+ support. This Mac runs macOS 13.7.8 on Intel; its native worker timed out. The existing Docker installation successfully started a Linux QVAC worker with networking disabled. On this computer use:

```sh
# One-time setup; downloads public runtime packages and a Node Linux image.
npm run prepare:desktop
# Stop any other preview on port 8786, then:
npm run preview:docker
```

Model inference runs in a local Linux container with `--network none`, a 6 GiB memory limit and four CPUs. Saved-record lookups use calculated data directly and do not load a model. Only the preview server's browser-to-computer loopback connection is used. This exercises the shared inference code but does not measure iPhone speed or memory.

## Model pack

`scripts/prepare-models.mjs` extracts pinned model URLs, sizes and SHA-256 checksums from the installed QVAC 0.22.0 catalog. `download-models.py` stages and verifies them, with interrupted-download resume support. A temporary Contabo folder was used to accelerate public-model downloading, followed by checksum-verified SSH chunk transfer using `fetch-staged-models.py`. This is preparation only; neither Contabo nor the Internet is needed for inference. Total size is approximately 1.69 GB:

| File | Model | Purpose |
| --- | --- | --- |
| `models/text.gguf` | Qwen3.5-2B Q4_K_M | Text answers and grounded guidance |
| `models/vision-flash.gguf` | VisionPsy-Nano-460M-Flash Q4_K_M | Preliminary photo observations |
| `models/vision-flash-mmproj.gguf` | Matching Flash Q8 projection | Image encoding |

All are pilot candidates, not field-validated models. Preserve model licensing and source notices when distributing. Model files are not committed. A GGUF header check in the phone importer detects obvious wrong files; it does not establish model identity, completeness, or that projection pairs match. Prefer transferring the checksum-verified pack from this computer.

## Build for the iPhone

The computer-compatible pilot lives in `native/iphone/`: a SwiftUI/WKWebView shell packages the responsive interface and runs the shared inference engine inside QVAC's native Bare runtime. It uses `@qvac/inference` directly and registers only the LLM plugin. This is a custom native integration; QVAC's documented mobile SDK route is Expo. The shell stores records and conversations in persistent on-device WebKit storage, separate from desktop data and from the Expo build's SQLite database. Self-tests use a third, isolated namespace.

On this Mac, with the existing Personal Team ID already saved locally in `.private/signing-team.txt`, run:

```sh
export PATH="$PWD/.tools/node_modules/node/bin:$PATH"
npm run build:iphone
# Find the paired phone; use its identifier below.
xcrun devicectl list devices
xcrun devicectl device install app --device PHONE_ID \
  .private/iphone-build/Build/Products/Release-iphoneos/DairyOSPhone.app
xcrun devicectl device copy to --device PHONE_ID --source models \
  --destination Documents/models --user mobile \
  --domain-type appDataContainer --domain-identifier com.emmanuelhaggai.dairyos.local
xcrun devicectl device process launch --device PHONE_ID com.emmanuelhaggai.dairyos.local
```

This native shell embeds the interface and QVAC libraries, and reads models from its own Documents/models folder. It needs no preview server, Metro or computer connection at runtime. Photo selection and camera access use native pickers, and selected images are resized locally. Keep the existing bundle ID and signing team when renewing; do not uninstall.

The installed pilot passed its final phone tests with Wi-Fi and cellular data off: English generation, a leaf-photo request, local commands, model checksums and restoring records/conversations after process restart. The last run took 8.84 s for text and 14.61 s for the photo. Photo accuracy remains experimental. See [VALIDATION.md](VALIDATION.md) for evidence and unvalidated cases.

For weekly renewal, rebuild and reinstall the same bundle without uninstalling. iOS required a brief connection to verify the newly signed build during this test; after verification, offline launch and inference passed. With the phone verified, unlocked and its connections disabled, the repeatable isolated checks are:

```sh
python3 scripts/validate-iphone.py --device PHONE_ID --offline-confirmed
```

The validator launches the installed app, checks fresh reports, restarts to verify stored data, and finally returns the app to normal mode. It does not install or download anything and does not edit the farmer's normal data namespace.

### Original Expo build

Use a current compatible build Mac with Xcode >=16.1, Node 22.21+ on the 22 line (the local project tool is 22.22.0), CocoaPods, and the existing Personal Team. QVAC requires a physical iOS device. Expo Go does not include QVAC's native engine.

```sh
npm run doctor:local
npm run prebuild:ios
# In Xcode, select the existing Personal Team for DairyOSLocal.
# Install native pods on the compatible build Mac as needed.
npm run ios
```

The `ios` script requests a **Release** build, so the installed app includes its JavaScript and does not require Metro, Wi-Fi, or a development computer at runtime. Bundle ID: `com.emmanuelhaggai.dairyos.local`. It is separate from Next Reply.

The inspected Mac has Xcode 15.2 and cannot compile the chosen React Native stack. This is independent of signing: using a Personal Team is fine for the pilot, but does not remove compiler requirements. Do not change system Xcode or signing certificates blindly.

On the iPhone, open Setup and import the three verified GGUF files from **On My iPhone**, or transfer them by Finder USB File Sharing into the app's `models` folder with the exact filenames above and tap Refresh. Models live in Documents, not purgeable cache. No models are requested from the registry or Internet during inference. Missing models produce a setup error. Cloud-only Photos or Files items must be made local before disconnecting; taking a new photo works offline.

Use the existing free Personal Team for testing and rebuild/reinstall using the same bundle ID before its weekly expiry. Do not uninstall when renewing: uninstalling removes local records, notes, chats and models. Signing renewal does not replace on-device acceptance testing.

## Behavior and limitations

- One local farm profile. No account login, server dependency or imported production data.
- Milk/feed/observation entries have explicit dates. Supported milk/feed quantity questions with an explicit YYYY-MM-DD date, today or yesterday are answered directly from calculated local data, without a model. Named animals/groups are selected when their saved names occur in the question. Missing entries are unknown rather than zero production. Other record-language queries remain experimental and may need a clearer question.
- Short questions such as “Milk today” and “Feed yesterday” also use calculated data. Explicitly named unknown animals ask for a saved name instead of returning whole-farm totals. Help, live-weather/price requests, equipment commands and requests to change records receive immediate capability responses. Chat does not change records or send hardware commands.
- Six brief FAO/CSU Extension starter summaries cover milking cleanliness, feed/water basics, poultry housing, livestock observations and crop inspection. Reference cards work without a model. This is not a complete agricultural library and needs local expert review before deployment.
- English/Kiswahili keyword retrieval selects actual stored passages. Optional plain-text notes are labelled user-provided. This is lexical retrieval, not an embedding-based vector database.
- Generated guidance is English-only for this pilot. Real Kiswahili generation tests produced repetitive or incoherent text, and even a Kiswahili question requesting English output remained unreliable. Kiswahili keyword search works; bilingual generation has not passed validation.
- For photos, a compact vision model produces an explicitly unverified description. When it passes the observed-failure checks, it is unloaded before the text model gives guidance. Unsupported health or absence claims in either stage discard the assessment and return the actual offline crop/livestock inspection guide, clearly labelled as general reference guidance. Photo advice is checked before being displayed. Vision mistakes can still propagate through other wording; these limited checks do not establish reliable image assessment or diagnosis.
- No diagnosis, prescribing or device-control tools. Prompts request uncertainty and escalation for serious illness; prompt instructions alone do not guarantee reliable behavior. Validate the actual model outputs.
- Tests exposed invented arithmetic and app menus in unconstrained model output. Record facts now bypass generation. Repetitive generations are cancelled/rejected; observed unsupported photo-health phrases are rejected; length-limited answers are marked partial and excluded from subsequent chat history. These checks address observed failures and do not guarantee factual or clinical accuracy.
- Models are unloaded and the QVAC worker closed after each answer. Backgrounding requests cancellation. This favors bounded memory over speed and requires hardware lifecycle testing.
- Temporary selected images are resized to a maximum side of 1,024 pixels. The conversation retains text and reference material, not a permanent image copy. Originals remain in Photos; interrupted processes can leave temporary cache files until cleaned by the OS.
- Local data may be included in device backups. No analytics telemetry, remote AI fallback, web search or OTA-update dependency is configured. Nearby farm telemetry uses BLE directly on the installed iPhone shell.

## Acceptance

See [VALIDATION.md](VALIDATION.md). Software tests, successful bundling, successful desktop inference and successful iPhone offline operation are separate milestones. Do not mark the last milestone complete until tested on the iPhone with cellular and Wi-Fi disabled.

The local browser flow can be checked with `node scripts/browser-check.mjs --inference` while the preview is running. It uses a separate Chrome test profile and synthetic farm records, then selects a public research leaf photo. Real-model transcripts and screenshots are retained under `.private/`.

## Primary technical references

- [QVAC Expo integration](https://docs.qvac.tether.io/sdk/js-ts-sdk/)
- [QVAC multimodal model pairs](https://docs.qvac.tether.io/sdk/ai-capabilities/multimodal/)
- [QVAC system requirements](https://docs.qvac.tether.io/sdk/system-requirements/)
- [VisionPsy intended use and limitations](https://github.com/tether-ai-research/qvac-visionpsy-nano)

## BLE sensors and controls — 0.3.0

Devices matches online DairyOS: temperature, humidity, bulb_1 and bulb_2. The installed iPhone shell uses CoreBluetooth, with no network dependency. Leave Bluetooth enabled when Wi-Fi/cellular are off. The computer preview provides an explicitly labeled simulator; the original Expo-native shell does not contain this CoreBluetooth bridge.

The screen scans/selects a board, displays fresh/unknown/stale values and allows explicit OFF or reviewed timed ON (1–30 seconds). GATT delivery is separate from matching board acknowledgment. Disconnects never fabricate a confirmed OFF. Firmware has a physical interlock and its own bounded run timer. Chat can answer direct sensor lookups without a model and routes equipment commands to Devices; inference and photos cannot send actuation commands. Server output requests and local BLE commands are independent.

See [UNO Q setup, wiring and alternatives](firmware/uno-q/README.md) and [BLE wire protocol](docs/ble/PROTOCOL.md). The reference firmware needs board commissioning; host simulation is not electrical validation.

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `python3 -m unittest discover -s firmware/uno-q -p 'test_*.py'`. With the web preview running: `node scripts/check-ble-ui.mjs`.
# dairyos-offline-ai
