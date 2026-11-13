# Renew an expired iPhone installation

DairyOS Local uses the Apple developer account configured on this Mac. Free
Personal Team provisioning profiles expire after seven days, even though the app
and its offline models are still on the phone. See
[Apple's account documentation](https://developer.apple.com/help/account/basics/about-your-developer-account).

## Renew the existing build

1. Connect the iPhone to this Mac, unlock it, and accept Trust prompts if shown.
   Keep internet available on the Mac for Apple signing. In Xcode > Settings >
   Accounts, ensure the existing Apple account is signed in.
2. From the repository root, find the phone:

   ```bash
   xcrun devicectl list devices
   ```

   Use the connected phone's Identifier below. If a sandboxed tool reports no
   devices, run the command in Terminal or grant that tool access to Apple's
   device service. If Terminal also finds none, check the cable, unlock the phone,
   and check Xcode > Window > Devices and Simulators.
3. Renew signing and rebuild the already generated native project:

   ```bash
   xcodebuild -quiet \
     -project .private/iphone/DairyOSPhone.xcodeproj \
     -scheme DairyOSPhone -configuration Release \
     -destination generic/platform=iOS \
     -derivedDataPath .private/iphone-build \
     -allowProvisioningUpdates build
   ```

   If the generated project is missing, or you also want to include source
   changes, run `npm run build:iphone` instead. That prepares the web assets,
   QVAC runtime, and native project before building. It requires the existing
   `.private/signing-team.txt` and local dependencies/resources.
4. Verify that the embedded profile has a future expiration date:

   ```bash
   python3 - <<'PY'
   import pathlib, plistlib
   path = pathlib.Path('.private/iphone-build/Build/Products/Release-iphoneos/DairyOSPhone.app/embedded.mobileprovision')
   data = path.read_bytes()
   profile = plistlib.loads(data[data.index(b'<?xml'):data.index(b'</plist>') + 8])
   print('Profile expires (UTC):', profile['ExpirationDate'])
   PY
   ```

   If it remains expired, open the generated project in Xcode, select the
   DairyOSPhone target's Signing & Capabilities tab, and resolve the displayed
   account or provisioning error with the existing team, then rebuild. Do not
   install a build whose profile is still expired.
5. Install over the existing app and launch it (replace `PHONE_IDENTIFIER`):

   ```bash
   xcrun devicectl device install app --device PHONE_IDENTIFIER \
     .private/iphone-build/Build/Products/Release-iphoneos/DairyOSPhone.app
   xcrun devicectl device process launch --device PHONE_IDENTIFIER \
     com.emmanuelhaggai.dairyos.local
   ```

6. On the phone, confirm that saved records and models are present and try an
   offline request. A successful process launch alone does not verify inference.

**Do not delete the existing app.** Reinstall using the same bundle identifier
(`com.emmanuelhaggai.dairyos.local`) and signing team so iOS can update it in
place and retain its data container. Deleting it removes its local data and
downloaded models. If iOS asks you to trust the developer, follow its prompt in
Settings > General > VPN & Device Management; keep Developer Mode enabled.

Renew again before the profile's printed expiration date. This procedure renews
the installation; it does not remove Apple's seven-day Personal Team limit.
