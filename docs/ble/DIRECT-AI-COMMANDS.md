> **Superseded duration policy:** 0.6.4 removes the default timer and adds coordinated persistent controls. See [Persistent control and sync](PERSISTENT-CONTROL-AND-SYNC.md). The validation below describes build17.

# Direct AI bulb commands — 0.6.2 / build 17

At the user's request, a clear immediate bulb request in Ask now sends directly after local AI interpretation and authorization. There is no review dialog or extra confirmation click for AI chat. This supersedes the earlier chat-confirmation policy. Manual Devices controls retain their review dialog.

The actual QVAC model interprets the request and recent conversation. Its independent second pass paraphrases the request and checks the authorized target/state. The two passes must agree before execution. Ambiguous targets, prohibitions, conditions/schedules, unsupported actions, invalid output, truncated inference and interrupted requests cannot be sent. There is no phrase-matching actuator router.

For an authorized bulb command, the app obtains fresh BLE telemetry, validates the board session, hardware interlock, fault state and allowed timer, and submits one 20-byte control frame. The user request itself is authorization. The app waits for the exact command sequence, board session, target and logical state to be acknowledged. A write accepted by iOS alone is not success. Missing/rejected acknowledgments produce an uncertainty message and no automatic control resend.

Bulb 1 remains normally ON: logical OFF energizes its relay for the requested/default hold; release or timer expiry returns it ON. Holds remain 1–30 seconds, default 10. Bulb 2 remains normally OFF. No GPIO policy, GATT endpoint or board firmware changes are required.

Ask stays busy until the command acknowledgment/failure completes. An in-flight request guard prevents rapid duplicate submission. The screen stays awake across inference, connection and acknowledgment so Auto-Lock does not interrupt an otherwise hands-free request. Deliberately leaving the app still stops inference and disconnects Bluetooth under the foreground-only policy.

The chat shows the actual board receipt or failure, not an invented success. A board receipt establishes reported relay state, not electrical lamp output.

Validation is recorded separately: automated transport/ACK tests, mocked UI integration, and actual QVAC/board tests must not be conflated. The changed authorization prompt requires new on-phone semantic acceptance; old model-worker results cannot be reused under a different checksum.

## Actual iPhone acceptance — 2 November 2026

The current worker passed all 12 real local-model semantic cases. The actual Ask UI then sent Bulb 1 OFF for five seconds, contextual "turn it back on", and capitalized "Turn bulb 1 back on" after a deliberate BLE disconnect. Each action produced a new matching board-confirmed receipt without displaying a confirmation dialog or clicking a confirmation button. Final reported state was Bulb 1 ON (relay OFF). The five-second OFF hold can expire before the later AI request finishes; each ON request still sends a new release frame and obtains its own acknowledgment.

45 automated tests and 10 explicitly mocked UI integration checks pass. The UNO Q BLE service was restarted after discovery timeouts; fresh GATT discovery and telemetry recovered. The local authorization audit no longer mentions the application's confirmation UI, which had caused an unnecessary clarification in an earlier run. The fresh worker's acceptance replaces that failed attempt. Normal mode was restored with all operator flags off.

See direct-ai-validation-0.6.2.json for scoped evidence. The report omits private conversation traces. Photo regression completed through an honest reference fallback; valid numeric sensor readings remain unavailable from the current board flags. These are separate from the passed bulb commands.
