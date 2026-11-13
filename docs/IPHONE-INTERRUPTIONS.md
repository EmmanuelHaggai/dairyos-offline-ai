# Brief interruptions on iPhone

Build 20 keeps a request running when DairyOS becomes inactive without entering
the background, such as when opening Notification Center or Control Center.
Starting a screen recording no longer deliberately cancels AI interpretation.
The existing four-minute inference timeout still applies.

When iOS actually backgrounds the app (switching apps or locking the phone),
the native shell saves the pending inference input in memory and stops the GPU
worker. Returning within three minutes restarts that inference under the same
pending UI request. A result that completed during the transition is delivered
on return instead of rerunning it. After three minutes, an unfinished request
expires and the user must ask again. Stop cancels a paused request too.

The app does not replay Bluetooth commands. Backgrounding disconnects Bluetooth;
the existing foreground connection and acknowledgment checks still apply.
Only AI interpretation/generation is eligible for restart. iOS can terminate the
app under memory pressure, so this in-memory grace period cannot survive process
termination. Background GPU execution is restricted by
[Apple's Metal lifecycle rules](https://developer.apple.com/documentation/metal/preparing-your-metal-app-to-run-in-the-background).

## Physical acceptance checks

1. Ask for temperature and humidity. While interpretation is loading, open and
   close Notification Center, then Control Center. Confirm the request completes
   without an interruption error and readings have their normal freshness label.
2. Start screen recording through Control Center while loading, return to
   DairyOS, and confirm the request completes.
3. During a request, switch apps for 10–30 seconds and return. Confirm that the
   pending request resumes, Bluetooth reconnects, and no duplicate conversation
   answer appears.
4. Leave an unfinished request backgrounded for more than three minutes. On
   return, confirm an expiry message rather than an automatic new request.
5. After returning while a paused worker is stopping, use Stop. Confirm it does
   not restart. Check normal foreground text and photo requests still complete.

These physical checks require the phone operator; a successful build and unit
suite do not verify Notification Center, screen recording, or iOS suspension.
