#!/bin/bash
# Build the Android app and install it on the connected phone. Adapted from pico-reader's rebuild-prod.sh.
#
# Usage:
#   ./rebuild.sh               # debug APK (default)
#   ./rebuild.sh --release     # signed release APK (needs android/key.properties)
#   ./rebuild.sh --no-install
#
# Debug and release builds have different signatures: switching between them needs an uninstall first
# (adb uninstall xyz.apicov.forro), which removes the imported songs and beat edits.

set -e
cd "$(dirname "$0")"

BUILD_TYPE="debug"
INSTALL=true
for arg in "$@"; do
    case $arg in
        --release|-r) BUILD_TYPE="release" ;;
        --no-install|-n) INSTALL=false ;;
        --help|-h) sed -n '2,10p' "$0"; exit 0 ;;
        *) echo "❌ Unknown option: $arg (see --help)"; exit 1 ;;
    esac
done

# Gradle needs JDK 21 (newer JDKs are too new for it); the Android SDK gives adb
if [ -z "$JAVA_HOME" ] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q '"21'; then
    for candidate in /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-21 /usr/lib/jvm/temurin-21-jdk; do
        if [ -x "$candidate/bin/java" ]; then export JAVA_HOME="$candidate"; break; fi
    done
fi
"$JAVA_HOME/bin/java" -version 2>&1 | grep -q '"21' || { echo "❌ JDK 21 not found (dnf install java-21-openjdk-devel)"; exit 1; }
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$(command -v adb || echo "$ANDROID_HOME/platform-tools/adb")"

if [ "$BUILD_TYPE" = "release" ] && [ ! -f android/key.properties ]; then
    echo "❌ Release build requested but android/key.properties is missing."
    exit 1
fi
if [ "$INSTALL" = true ] && ! "$ADB" devices | grep -qw "device$"; then
    echo "❌ No phone connected (USB debugging on, and the computer allowed on the phone)."
    echo "   Check with: $ADB devices    — or build only: ./rebuild.sh --no-install"
    exit 1
fi

echo "📦 Building the web app and syncing it into the Android project..."
npm run build

echo "📱 Building the APK ($BUILD_TYPE)..."
cd android
if [ "$BUILD_TYPE" = "release" ]; then
    ./gradlew assembleRelease
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
else
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi
echo "✅ $(pwd)/$APK_PATH"

if [ "$INSTALL" = true ]; then
    echo "📲 Installing on the phone (keeps the imported songs)..."
    "$ADB" install -r -d "$APK_PATH"
fi
