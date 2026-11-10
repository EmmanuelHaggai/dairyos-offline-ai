# Stronger local model candidate — 0.6.0 / build 15

Current status: the experimental local Q3_K_M copy passed 12 on-phone semantic cases, normal guidance, the honest photo-reference fallback, and three confirmed AI-to-BLE actions including conversational restoration and automatic reconnection. The original Q4 candidate was not stable. See the final acceptance section for measured latency and limits; the sections below record the experiments in order.

The 2B model failed basic intent acceptance cases. It must not be described as a reliable natural-language controller. The phrase router remains removed; this candidate evaluates a stronger model rather than replacing model understanding with phrase rules.

The candidate is [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), a non-thinking instruction model under Apache 2.0. The [quantizer's file repository](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF) supplies the pinned Q4_K_M file.

- Revision: `ae44f08e1392f39c0e474af10c3ff8355c8b6688`
- Local/phone file: `models/text-qwen3-4b.gguf`
- Size: 2,497,280,736 bytes
- SHA-256: `2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e`
- Vision and projection files remain unchanged.

The smaller `text.gguf` is retained; do not uninstall the app or delete farmer data to change model files.

Candidate text configuration: QVAC 0.22.0, Metal GPU with **24 layers offloaded**, 2,048-token context, flash attention, q8_0 key/value cache, logical batch 128 and microbatch 32. Text inference does not allocate a thinking budget. The non-thinking model uses QVAC structured JSON output for interpretation and authorization checks; application validation still checks the fields relevant to the selected capability. Context is bounded and only one model is resident at a time.

On 2026-11-01, full GPU offload failed model initialization. CPU loading aborted in the native graph allocator after the runtime reported insufficient system memory. Partial offload at 24 layers successfully completed the first actual on-phone command interpretation and authorization in 15.8 seconds. All three model checksums matched on the phone. Full semantic, guidance/photo, and physical-control acceptance remains pending; one successful request is not general acceptance. The first full run exposed conversational-reference and clarification failures, without actuation. A later load also aborted in the native allocator. The current reduced context/batch configuration is under repeated-load testing. The 24-layer setting is the text GPU default, independent of diagnostic environment variables.

Acceptance requires the full checksum on both computer and phone, actual on-phone inference, recorded peak memory/available headroom, semantic command/sensor/advice tests, and new matching board-confirmed receipts for the interactive OFF → follow-up ON → disconnected automatic connection sequence. Model JSON never goes directly to the Arduino; the existing 20-byte protocol and human confirmation remain.

Operator test results are written to `Documents/semantic-validation.json`, memory samples to `Documents/semantic-memory.json`, and per-request resource results to `Documents/inference-checks.json`. Historical 2B passes must not be counted as acceptance of this model. Do not publish a successful validation claim until the new run finishes.

## Personal Team memory investigation

A repeat-load attempt and reduced 2,048-token context/batch settings still hit `GGML_ASSERT(ctx->mem_buffer != NULL)` in the native graph allocator. Loading without mmap did not resolve the observed failure. These are failed experiments, not supported settings. Apple Xcode rejected Extended Virtual Addressing because Personal Teams do not support that capability; the entitlement was removed and the project continues using the existing Personal Team. A smaller quantization is being prepared for evaluation. Physical actuation acceptance has not run because the semantic gate has not passed.

## Current smaller-model experiment

The installed candidate now targets `text-qwen3-4b-q3.gguf` (2,075,618,016 bytes), SHA-256 `8e607bb4c5562e1b514e733ea3d636a1ff5ac9fd914704fb4e8e729e50bd8b53`. It was generated locally from the verified Q4_K_M artifact above, using ggml-org/llama.cpp revision `dde879bc4f954b809892fd0d660515f42536394a`:

```sh
llama-quantize --allow-requantize models/text-qwen3-4b.gguf models/text-qwen3-4b-q3.gguf Q3_K_M 4
```

This is a lossy requantization, not the publisher's Q3 artifact. Its quality requires independent validation. See `models/text-qwen3-4b-q3.provenance.json`. No remote URL is assigned to this locally generated file. Keep the original Q4 and earlier 2B files. Current text defaults: mmap, 24 GPU layers, context 2,048, logical batch 128, microbatch 32, q8 key/value cache, one model at a time. Intent history is bounded to the last two turns. Stronger context instructions remain actual model prompts, not string-match routing.

## Semantic authorization revision

The first Q3 run completed 12 requests without a native crash, but one prohibition was incorrectly approved as an ON action. No actuation ran. The revised verifier first paraphrases the user's intended meaning, then independently predicts the authorized bulb/state and authorization boolean. The application requires agreement with the first pass before presenting confirmation. Prohibitions, conditions, unclear references, disagreements, malformed output and interrupted inference cannot send a command. Human confirmation and board acknowledgments remain required. This reduces observed errors but is not a guarantee that a small language model understands every request.

## On-phone acceptance — 1 November 2026

The revised Q3 candidate passed all 12 recorded semantic cases, including ambiguous targets, both capitalization forms, conversational restoration, figurative wording, prohibitions with/without context, conditional requests and sensor-versus-advice classification. Median interpretation time was 26.0 seconds (range 14.6–34.0 seconds). A contextual UI follow-up took about 47 seconds because the app retries with recent conversation after an initial clarification. These are a limited test set, not a general accuracy guarantee.

Normal milking-hygiene guidance completed in 23.3 seconds. The leaf-photo pipeline completed in 25.8 seconds by discarding an unreliable visual assessment and displaying the offline inspection reference; this is a successful honest fallback, not successful visual diagnosis.

The first physical attempt found no advertising board and sent no command. Once the user confirmed board availability, the operator resumed only the physical phase, rechecking model hashes and binding the report to the unchanged inference-worker checksum. Three real chat/confirmation actions each produced a new matching board acknowledgment: Bulb 1 OFF for five seconds; contextual "turn it back on"; then explicit capitalized "Turn bulb 1 back on" after deliberate disconnection and automatic BLE reconnection. Final reported Bulb 1 state was ON (relay OFF). The short OFF timer may restore the normally-ON bulb before the later AI request completes; the ON requests still receive new sequence acknowledgments. These checks verify board reporting, not electrical lamp output.

43 automated tests and six explicitly mocked browser integration checks passed. Current Wi-Fi/cellular settings were not independently reconfirmed; all inference in this build uses staged local model files, with no remote language service. Spontaneous dropout/headphone investigation remains deferred.

## Live sensor chat — valid measurements unavailable

The real UI question "How warm and humid is it here right now?" routed through local AI to the BLE sensor path and connected automatically. The current UNO Q frames carry flags `0x08`: interlock armed, **sensor-valid bit clear**. At 2026-11-01T20:31:41Z the link was ready with RSSI about -57 dBm. The phone correctly answered that no measured temperature or humidity had been received; it did not present the raw zero placeholders as measurements. The live numeric-match test therefore remains unpassed pending valid board sensor data. This does not invalidate the separately passed bulb commands or 12 semantic cases. Check the commissioned DHT11/MCU snapshot on the UNO Q computer; do not substitute fabricated readings or overwrite the tested firmware with the original SHT31 reference sketch.
