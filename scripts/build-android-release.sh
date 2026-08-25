#!/usr/bin/env bash
# Build the signed Android App Bundle (.aab) for the Google Play Console.
#
# The upload key is NEVER stored in the repository. Provide it in ONE of two ways:
#
#   1. client/android/keystore.properties  (gitignored) containing:
#        storeFile=/absolute/path/to/upload-keystore.jks
#        storePassword=...
#        keyAlias=...
#        keyPassword=...        # optional for a PKCS12 keystore
#
#   2. environment variables:
#        ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD,
#        ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
#
# Without either, Gradle still builds a bundle but leaves it UNSIGNED, which the
# Play Console refuses. This script says so explicitly rather than handing you an
# artifact that fails at upload time.
#
# Usage:  bash scripts/build-android-release.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/client/android"
OUT_DIR="${OUT_DIR:-$ROOT/dist/android}"

# Toolchain: use the SDK installed on this server unless the caller overrides it.
export ANDROID_HOME="${ANDROID_HOME:-/mnt/data/android-sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

command -v java >/dev/null || { echo "ERROR: java not found (need JDK 21)."; exit 1; }
[ -d "$ANDROID_HOME/platforms" ] || { echo "ERROR: Android SDK not found at $ANDROID_HOME"; exit 1; }

VERSION_CODE=$(grep -oP 'versionCode\s+\K[0-9]+' "$ANDROID_DIR/app/build.gradle")
VERSION_NAME=$(grep -oP 'versionName\s+"\K[^"]+' "$ANDROID_DIR/app/build.gradle")
echo "▶ OpenFamily ${VERSION_NAME} (versionCode ${VERSION_CODE})"

# Play rejects a versionCode that is not strictly greater than the last upload.
if [ -z "${SKIP_VERSION_REMINDER:-}" ]; then
  echo "  Reminder: versionCode must be greater than the last one uploaded to Play."
fi

echo "▶ Building web assets (native mode)"
( cd "$ROOT" && npm run build:shared >/dev/null )
( cd "$ROOT/client" && npm run build:native >/dev/null )

echo "▶ Syncing the Android project"
( cd "$ROOT/client" && npx cap sync android >/dev/null )

echo "▶ Gradle bundleRelease"
( cd "$ANDROID_DIR" && chmod +x gradlew && ./gradlew bundleRelease --no-daemon -q )

AAB="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
[ -f "$AAB" ] || { echo "ERROR: no bundle produced at $AAB"; exit 1; }

mkdir -p "$OUT_DIR"
DEST="$OUT_DIR/OpenFamily-${VERSION_NAME}.aab"

# A signed bundle carries a META-INF/*.RSA (or .DSA/.EC) block. Check rather than
# assume: an unsigned upload is rejected by Play after the fact, which is a slow
# and confusing way to discover the keystore was not picked up.
if unzip -l "$AAB" | grep -qiE 'META-INF/[^/]+\.(RSA|DSA|EC)$'; then
    cp "$AAB" "$DEST"
    echo "✅ Signed bundle: $DEST"
    echo "   Upload it to the Play Console (Production → Create new release)."
else
    cp "$AAB" "${DEST%.aab}-unsigned.aab"
    echo "⚠️  The bundle is UNSIGNED: ${DEST%.aab}-unsigned.aab"
    echo "    Gradle found no upload key, so the Play Console would refuse it."
    echo "    Add client/android/keystore.properties (see the header of this script)"
    echo "    and run this script again, or sign the existing bundle with:"
    echo "      jarsigner -keystore <upload-keystore.jks> \\"
    echo "        -signedjar \"$DEST\" \"${DEST%.aab}-unsigned.aab\" <alias> \\"
    echo "        -sigalg SHA256withRSA -digestalg SHA-256"
    exit 2
fi
