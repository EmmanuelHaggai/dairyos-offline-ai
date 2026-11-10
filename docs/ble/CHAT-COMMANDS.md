> Superseded by [SEMANTIC-AI.md](SEMANTIC-AI.md) in 0.5.0. The phrase router described below has been removed.

# Natural-language farm device chat — DairyOS Local0.4.0 build13

Connect the commissioned UNO Q in **Devices**, then use **Ask**. Device questions and supported commands are processed locally without internet or model loading. QVAC remains available for normal farm/photo guidance. The existing BLE service UUID, binary frames, pairing/permissions and board firmware are unchanged.

## Examples

| Ask | Behavior |
| --- | --- |
| What is the temperature and humidity? | Last measured values with their original receipt time |
| Check temperature / how hot is it? | Temperature measurement |
| Humidity now / how humid is it? | Humidity measurement |
| Is Bulb1 on? / show both bulbs | Logical bulb status from board telemetry |
| Turn Bulb1 on | Review Bulb1 ON, then send after confirmation |
| Turn it off | Use the last unambiguous bulb in this chat, then review OFF |
| Switch off Bulb2 | Review Bulb2 OFF |
| Turn it on | After the previous example, review Bulb2 ON |
| Turn Bulb1 off for5 seconds | Bounded5-second relay hold |

Case, polite forms, one/two, first/second and bulb/light/lamp aliases are supported. Small temperature/humidity spelling variations are recognized. A short ON/OFF follow-up is accepted only with valid recent context.

## Follow-up context

“It”, “that bulb” and “the same light” refer to the most recent single bulb named or requested in this chat. Context expires after10 minutes and is tied to the same board session. It is not reconstructed from old saved conversations after reopening the app. Unrelated farm questions, clearing the conversation, ambiguous/multi-bulb requests or changing the board session remove the assumption. A status question about both bulbs makes “it” ambiguous. The assistant then asks which bulb, without sending a command.

## Confirmation and receipt

Ask and Devices share `useBulbControl` and `BulbConfirmation`. Both ON and OFF require explicit dialog confirmation. Typing the request, reading status, or pressing Cancel does not send a control frame. Sending requires current-connection telemetry under6 seconds old. The confirmation shows the resolved target, action and time limit; it cannot silently act on a stale session.

The chat saves the original question and the board-confirmed result after an exact session/sequence/state ACK. A cancel saves “No equipment command was sent”; a failed/unknown result does not claim success and is never retried automatically. A GPIO report confirms firmware state, not electrical lamp output.

## Normally-ON installation profile and firmware limits

Bulb1 remains normally ON: logical ON releases its relay; logical OFF energizes the relay for the bounded hold. Bulb2 remains normally OFF: logical ON uses the hold; OFF releases the relay. The default energized hold is10 seconds, with1–30 supported. A released relay leaves the output in its normal state. Timed requests for a normal/released state are rejected because this firmware cannot schedule the reverse action later. The dialog and receipt state the actual supported behavior rather than promising indefinite or scheduled switching.

Only Bulb1 and Bulb2 are configured. Conditions, schedules, negated instructions, quoted instructions and multi-output actions do not switch hardware. The app asks for one direct supported command. Photo attachments and model-generated answers cannot become device commands; only the user's typed question enters the device language router.

## Sensor/state honesty

No sensor measurement means unknown, never a placeholder. Existing last measurements retain their original timestamp through a disconnected board and are labeled stale after5 minutes without a valid measurement. Bulb status uses the logical normally-ON mapping and identifies an old report when current telemetry is missing. The feature does not fix the previously observed radio timeout; connect the board before attempting control.

## Implementation and validation

- `src/ble/chat-intents.ts`: pure local intent parsing and measurement/state formatting.
- `App.tsx`: conversational context, dispatch, local replies and saved command outcomes.
- `src/ui/useBulbControl.tsx`: shared confirmation and ACK lifecycle for Ask and Devices.
- `tests/chat-intents.test.ts`: phrase variants, pronouns, expiration/session changes, read-only intents, rejected unsafe/unsupported requests, durations and measured replies.
- `scripts/check-chat-devices.mjs`:20 isolated browser checks through actual Ask input, shared dialog, mock BLE frames and chat receipts. Covers the requested command chain, cancellation, ambiguous pronouns, unrelated-topic/clear-chat resets and disconnected controls. The fixture sends no physical hardware requests.

43 TypeScript tests pass;29 existing BLE UI checks and7 confirmation failure/duplicate-write checks remain passing after sharing the controller. Typecheck/lint and signed iPhone build pass. The on-device isolated regression includes sensor questions, ambiguous pronouns and disconnected-command refusals without actuating outputs; its final run is recorded in VALIDATION.md.
