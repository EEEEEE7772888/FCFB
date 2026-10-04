#!/bin/bash
# Runs on Codemagic's Mac after "npx cap add ios". Adds FCFB's icon,
# launch screen, sign-in settings, and privacy file to the iOS project.
set -euo pipefail
cd "$(dirname "$0")"

APP_DIR=ios/App/App
PLIST="$APP_DIR/Info.plist"
PB=/usr/libexec/PlistBuddy

echo "== App icon and launch screen"
for f in "$APP_DIR"/Assets.xcassets/AppIcon.appiconset/*.png; do cp icon-1024.png "$f"; done
if [ -d "$APP_DIR/Assets.xcassets/Splash.imageset" ]; then
  for f in "$APP_DIR"/Assets.xcassets/Splash.imageset/*.png; do cp splash-2732.png "$f"; done
fi

echo "== Info.plist"
$PB -c "Delete :ITSAppUsesNonExemptEncryption" "$PLIST" 2>/dev/null || true
$PB -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST"
$PB -c "Delete :UISupportedInterfaceOrientations" "$PLIST" 2>/dev/null || true
$PB -c "Add :UISupportedInterfaceOrientations array" "$PLIST"
$PB -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PLIST"
$PB -c "Delete :UISupportedInterfaceOrientations~ipad" "$PLIST" 2>/dev/null || true

echo "== Google sign-in (GoogleService-Info.plist)"
if [ ! -f GoogleService-Info.plist ]; then
  echo "ERROR: GoogleService-Info.plist is missing. Download it from Firebase (Project settings, your iOS app) and upload it to the main file list on GitHub."
  exit 1
fi
cp GoogleService-Info.plist "$APP_DIR/"
REVERSED=$($PB -c "Print :REVERSED_CLIENT_ID" GoogleService-Info.plist)
$PB -c "Delete :CFBundleURLTypes" "$PLIST" 2>/dev/null || true
$PB -c "Add :CFBundleURLTypes array" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string $REVERSED" "$PLIST"

echo "== Podfile (Google sign-in library, iOS 15+)"
PODFILE=ios/App/Podfile
sed -i '' -E "s/^platform :ios, '[0-9.]+'/platform :ios, '15.0'/" "$PODFILE"
if ! grep -q "CapacitorFirebaseAuthentication/Google" "$PODFILE"; then
  awk '{ print } /^[[:space:]]*capacitor_pods[[:space:]]*$/ { print "  pod '\''CapacitorFirebaseAuthentication/Google'\'', :path => '\''../../node_modules/@capacitor-firebase/authentication'\''" }' "$PODFILE" > "$PODFILE.new"
  mv "$PODFILE.new" "$PODFILE"
fi
grep -n "capacitor_pods\|Google\|platform" "$PODFILE" || true

echo "== Sign in with Apple permission and privacy file"
cp PrivacyInfo.xcprivacy "$APP_DIR/"
cat > "$APP_DIR/App.entitlements" <<'PLISTEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.applesignin</key>
  <array><string>Default</string></array>
</dict>
</plist>
PLISTEOF

echo "== Xcode project settings"
ruby -e "require 'xcodeproj'" 2>/dev/null || gem install xcodeproj --no-document
ruby configure-ios.rb
echo "== Done"
