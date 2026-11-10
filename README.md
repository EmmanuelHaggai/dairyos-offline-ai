# DairyOS Local 🌱

**Your farm. Your intelligence. Even offline.**

DairyOS is an offline-first farm intelligence app that runs AI directly on an iPhone using **Tether QVAC**. Farmers can ask agricultural questions, analyze farm photos, query locally stored records, read nearby sensors, and control connected devices over Bluetooth Low Energy (BLE), without internet access for these core workflows.

## 🎬 Demo

**[Watch the DairyOS offline demo on Vimeo](https://vimeo.com/1241299928?share=copy&fl=sv&fe=ci)**

## What it does

- **Offline AI assistant:** Agricultural guidance generated on-device with QVAC.
- **Photo guidance:** Take or select a photo for preliminary AI observations and general guidance.
- **Local farm records:** Ask about saved farm data, including supported milk and feed queries.
- **BLE sensor readings:** View nearby temperature and humidity readings without Wi-Fi or cellular data.
- **BLE equipment control:** Untimed ON/OFF requests persist on a coordinated v2 board; explicitly requested timers remain bounded to 1–30 seconds. The board queues Bluetooth changes for database sync when its internet returns.
- **Offline reference library:** Access bundled agricultural guidance and saved notes.

## Cloud to pocket

DairyOS previously supported cloud-connected farm automation through WhatsApp. The local app brings core farm guidance and nearby hardware control onto the phone:

| Cloud-connected workflow | DairyOS Local |
| --- | --- |
| WhatsApp commands require connectivity | iPhone app works offline for core features |
| Cloud-connected processing | QVAC inference on-device |
| Network-mediated equipment control | Direct BLE communication with nearby hardware |

The original WhatsApp workflow, model downloads, installation, and any future cloud synchronization still require connectivity. BLE requires proximity to compatible devices.

## Technology

- **Tested device:** iPhone 13 Pro Max (Apple A15 Bionic)
- **AI runtime:** `@qvac/inference` (QVAC **0.22.0**)
- **Text model candidate:** Qwen3-4B-Instruct-2507, experimental locally requantized Q3_K_M; see the [upgrade acceptance notes](docs/ble/LOCAL-AI-UPGRADE.md).
- **Vision model:** VisionPsy-Nano-460M-Flash Q4_K_M with matching Q8 projection
- **Model pack:** Approximately **2.49 GB**, staged and verified before offline use
- **iOS implementation:** SwiftUI / WKWebView shell with QVAC's native Bare runtime in `native/iphone/`
- **Local data:** Persistent on-device WebKit storage in the iPhone shell
- **Hardware communication:** CoreBluetooth BLE for sensor readings and explicit timed controls


## Run and validate

```bash
npm install
npm run typecheck
npm run lint
npm test
node scripts/prepare-models.mjs
python3 scripts/download-models.py
npm run export:web
npm run preview
```

The browser preview opens at **http://127.0.0.1:8786**. It runs QVAC locally on the development computer and does not call a cloud inference provider. On the tested Intel Mac with macOS 13.7.8, the local Linux Docker route is used:

```bash
npm run prepare:desktop
npm run preview:docker
```

Docker inference runs with networking disabled. To build the custom iPhone shell:

```bash
npm run build:iphone
```

Install the resulting app using Xcode's device tools and the project's existing signing configuration, then copy the verified model pack into the app's `Documents/models` directory. The phone app runs without a preview server or development computer once installed and configured. The original Expo build has separate build requirements.

For detailed test procedures, see [VALIDATION.md](VALIDATION.md). For hardware setup, see [UNO Q wiring and setup](firmware/uno-q/README.md) and the [BLE protocol](docs/ble/PROTOCOL.md).

## Offline validation and limits

On the iPhone 13 Pro Max, text generation, a leaf-photo request, local commands, model checksums, and record persistence passed tests with **Wi-Fi and cellular data disabled**. One recorded run took **8.84 seconds** for text and **14.61 seconds** for a photo request; these are observations, not guaranteed performance.

BLE readings and control are separate from AI inference. The app distinguishes fresh, stale, and unknown sensor readings and does not assume a command succeeded without device acknowledgment. Continuous automation, speech, cloud sync, and autonomous AI device control are not included in this pilot.

## Documentation

- [Validation and test evidence](VALIDATION.md)
- [Design notes](docs/design/DESIGN.md)
- [BLE wire protocol](docs/ble/PROTOCOL.md)
- [QVAC documentation](https://docs.qvac.tether.io/sdk/js-ts-sdk/)

---

## Local AI device chat — 0.6.0 candidate

Ask naturally about sensor readings or a bulb action. QVAC interprets the request and recent conversation on the iPhone, including follow-ups such as “turn it back on”. The app attempts a nearby BLE connection automatically, sends clear immediate bulb requests directly, and only records success after the matching board acknowledgment. Multiple nearby boards require explicit selection.

The phrase router has been removed. Invalid model output sends no command; ambiguous language may require clarification. The model can misunderstand requests, and asks for clarification when the request is unresolved. Bulb 1 remains normally ON; timed relay holds remain bounded to 1–30 seconds.

[Semantic AI implementation and limitations](docs/ble/SEMANTIC-AI.md).

## Automatic nearby-board connection — 0.6.1

Opening the iPhone app discovers and connects to the remembered DairyOS board without running AI. Connection/presence is visible across screens; Disconnect pauses automatic connection and Resume auto-connect restarts it. Several unknown boards require selection. See [Bluetooth behavior and range limits](docs/ble/AUTOMATIC-CONNECTION.md).

## Direct AI bulb requests — 0.6.2

Ask sends clear bulb commands directly, without an extra confirmation click, after local interpretation/authorization and BLE readiness checks. Board acknowledgments still determine success. See [direct command behavior](docs/ble/DIRECT-AI-COMMANDS.md).

## Persistent control and database sync — 0.6.4 / build 19

No requested duration means a persistent state, with independent local-model duration verification. Protocol v2 and the board single-writer update prevent a stale online poll from undoing a Bluetooth command. The server API is deployed; the commissioned UNO Q still needs integration and physical acceptance by its connected computer. See [implementation and commissioning instructions](docs/ble/PERSISTENT-CONTROL-AND-SYNC.md). A v1 board receives an upgrade message for untimed commands; the phone never substitutes 10 seconds. Earlier timer-only descriptions are historical.
