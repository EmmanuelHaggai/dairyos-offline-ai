# Request feedback — 0.6.3 / build 18

Sending captures the original request and selected photo, clears the composer immediately, dismisses keyboard focus, and displays the submitted request in the conversation. Busy state starts before the native activity lease or inference request. The existing in-flight guard still prevents duplicate sends.

Processing remains visible throughout interpretation, contextual interpretation, guidance generation, Bluetooth connection, and board acknowledgment. The conversation shows a stage label and elapsed time; the composer repeats the current stage so it remains obvious even while viewing a long answer. New requests, streamed answer growth, completion, errors and keyboard/viewport layout changes reveal the newest conversation content.

A completed saved turn replaces the temporary request bubble without duplication. Failed requests keep their submitted text and an inline error near the latest conversation rather than hiding the error above old history. Clearing the conversation also clears temporary UI state. The photo attachment is hidden from the composer during processing and identified in the submitted request; photo cleanup remains deferred until processing ends.

The change does not alter language interpretation, direct bulb execution, protocol frames, interlocks, timers, acknowledgments or automatic connection policy. No model download, UNO Q change or saved-data migration is required.

Automatic following pauses when the user scrolls up to read older messages and resumes at the bottom or on a new request.

Validation uses ten responsive UI fixture checks (long history, immediate clearing/focus, preserved original request, visible processing, elapsed time, streaming follow, narrow viewport, manual history scrolling, completion and failure) and the existing direct-command integration checks. A read-only real-iPhone check is recorded separately; no actuator writes are permitted in that test.

Actual iPhone validation passed all four UI checks at 2026-11-02 12:34 UTC, with zero control writes. The board supplied fresh 26.7 °C and 52% readings for the controlled read-only request.
