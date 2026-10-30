#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x .tools/node_modules/node/bin/node ]; then
  export PATH="$PWD/.tools/node_modules/node/bin:$PATH"
fi
if [ ! -s .private/signing-team.txt ]; then
  echo 'Set .private/signing-team.txt to the existing Apple Personal Team ID before building.' >&2
  exit 1
fi
npm run export:web
npm run prepare:iphone
ruby native/iphone/generate.rb
xcodebuild -quiet \
  -project .private/iphone/DairyOSPhone.xcodeproj \
  -scheme DairyOSPhone -configuration Release \
  -destination generic/platform=iOS \
  -derivedDataPath .private/iphone-build \
  -allowProvisioningUpdates build
echo 'Built .private/iphone-build/Build/Products/Release-iphoneos/DairyOSPhone.app'
