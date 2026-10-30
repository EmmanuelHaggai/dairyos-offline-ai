# iPhone model compatibility

## Current evidence

The USB-connected phone identifies as an iPhone 13 Pro Max (`iPhone14,3`), running iOS 26.6.2, with 256,000,000,000 bytes of advertised storage. A native diagnostic captured the following values on 2026-10-30 at 05:35:29 UTC:

| Resource | Measured value |
| --- | --- |
| Physical RAM exposed to the OS | 5,915,164,672 bytes (5.51 GiB) |
| Remaining diagnostic-app dirty-memory allowance | 3,207,593,160 bytes (2.99 GiB) |
| Diagnostic physical footprint | 12,845,880 bytes (12.25 MiB) |
| Free storage | 59,689,119,744 bytes (55.59 GiB) |
| Available for important usage, including reclaimable space | 98,060,457,465 bytes (91.33 GiB) |
| GPU | Apple A15 GPU |
| Metal recommended working set | 4,294,983,680 bytes (4.00 GiB) |
| Maximum single Metal buffer | 3,221,225,472 bytes (3.00 GiB) |
| Processor count | 6 |
| Thermal state / Low Power Mode | nominal / disabled |

A small native SwiftUI app, **DairyOS Check**, was built, installed and launched using the existing local developer account. The diagnostic is separate from the QVAC AI app and loads no models. Its source is in `experiments/resource-probe/`.

The raw report was retrieved into `.private/iphone-resource-report.json`. No device serial or personal content is included.

`os_proc_available_memory()` measures the current app's remaining memory allowance; it is not free system RAM and can change. A tiny diagnostic has a smaller footprint than the final AI app. Metal's recommended working set is also not a guarantee of safe model allocation.

## Candidates already staged

| Model | Local files | Status |
| --- | ---: | --- |
| Qwen3.5 2B Q4_K_M, text | 1,280,835,840 bytes | Loaded and generated on this phone, including with Wi-Fi/cellular off |
| VisionPsy Nano 460M Flash Q4_K_M plus projector | 411,925,632 bytes | Loaded and processed a leaf image on this phone; visual accuracy remains poor |
| Combined storage | 1,692,761,472 bytes | Excludes app, imports, photos and working space |

The implementation unloads vision before loading text. Model file size excludes inference buffers, context/cache, image processing and application/runtime overhead. The staged 2B text candidate and separate small vision stage have now run successfully on this phone. This supports their resource compatibility for this pilot; it does not establish sustained thermal/battery behavior or photographic accuracy. A larger model is not justified by these results.

## Actual native inference

The final offline run completed English guidance in 8.84 seconds and a two-stage leaf request in 14.61 seconds. Earlier cold text startup took 32.7 seconds, so do not promise a fixed latency. All three models matched their pinned SHA-256 hashes when checked on the phone.

An earlier photo run sampled a 422,004,520-byte app physical footprint and 2,799,220,952 bytes of remaining dirty-memory allowance. Sampling is not an exact peak profiler; file-backed weights and the separate WebKit content process are not fully represented by this metric. Native load/generation success is the stronger fit evidence. Raw later samples are retained in `.private/iphone-inference-checks.json`.

## Remaining compatibility gate

1. Resource baseline: completed; measured values above justify trialling the staged candidates.
2. The original React Native stack requires Xcode 16.1 or later, while this Mac has 15.2. An additional native SwiftUI/WKWebView shell using the shared interface, shared inference engine and QVAC's Bare runtime compiled and installed with Xcode 15.2. This is a custom native integration; QVAC's documented mobile SDK path remains Expo.
3. Actual local model loading and generation with the configured 4096-token context passed. QVAC's advisory model-fit assessment has not been separately run; assess stages individually if adding it.
4. Native repeated launches, text/photo requests, offline operation and data restoration after restart passed. Full peak profiling, prolonged soak tests, camera permission/capture, thermal and battery review remain pending. The operator confirmed Wi-Fi and cellular data off; Airplane Mode itself was not independently verified.

The models are tested pilot configurations on this specific phone, not certified field-ready systems. In particular, the vision model missed visible leaf marks. Observed unsupported health/absence claims are discarded in favor of the actual offline inspection guides; other visual mistakes can still occur.
