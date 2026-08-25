# OpenFamily — Android app (Capacitor)

The Android app is a **thin client**, not a hosted service. It bundles the OpenFamily
web UI and, on first launch, asks for **your own self-hosted server's address** — exactly
like the Nextcloud / Home Assistant / Jellyfin apps. OpenFamily (NexaFlow) hosts nothing.

- App shell: [`client/capacitor.config.ts`](../client/capacitor.config.ts)
- Runtime server URL: [`client/src/lib/serverConfig.ts`](../client/src/lib/serverConfig.ts)
- First-run screen: [`client/src/pages/ServerSetup.tsx`](../client/src/pages/ServerSetup.tsx)
  (change/disconnect later from **Settings → Server**)

## How it connects

- The web build resolves its API/WebSocket origin from the page (same-origin). The native
  app has no origin, so `serverConfig` stores a user-entered base URL on the device
  (`@capacitor/preferences`) and `apiBase()` / `wsBase()` use it.
- Auth is a **Bearer token** (no cookies). The server already allows the app's shell
  origins (`http://localhost`, `https://localhost`, `capacitor://localhost`) in CORS, so
  **no `CORS_ORIGINS` change is needed** for the app to connect.
- `androidScheme: 'http'` + cleartext is enabled so a plain‑HTTP LAN server
  (`http://192.168.x.y:3001`) works out of the box. HTTPS / Tailscale addresses work too.

## Build the APK

### Via GitHub Actions (recommended)
Push a `v*` tag or run the **Android APK** workflow manually
([`.github/workflows/android.yml`](../.github/workflows/android.yml)). It outputs a
debug‑signed `OpenFamily.apk` (sideload‑installable) and attaches it to the Release, so the
latest build is always available at:

```
https://github.com/NexaFlowFrance/OpenFamily/releases/latest/download/OpenFamily.apk
```

### Locally
Prerequisites: Node 20+, JDK 21, Android SDK (Android Studio).

```bash
npm run install:all
npm run build:shared
cd client
npm run android:add     # first time only — (re)generates client/android/ (already committed)
npm run cap:sync        # build:native + cap sync
npm run android:open    # open in Android Studio → Run / Build APK
# or a one-liner onto a connected device/emulator:
npm run android:run
```

The debug APK lands at `client/android/app/build/outputs/apk/debug/app-debug.apk`.

## Distribute to users

Point people at the GitHub Release download URL above. For **automatic updates** without an
app store, they can add the repo to [Obtainium](https://github.com/ImranR98/Obtainium),
which tracks GitHub Releases and updates the APK on its own.

## Release signing (only for an app store)

Sideloaded debug APKs don't need this. Google Play requires a **release-signed
App Bundle (`.aab`)**, not an APK. The signing config is already wired in
[`client/android/app/build.gradle`](../client/android/app/build.gradle): it reads
credentials from `client/android/keystore.properties` (gitignored) or, in CI, from
environment variables.

### 1. Create your upload keystore (once)

```bash
keytool -genkeypair -v -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Keep this `.jks` file and its passwords **safe and backed up**. With Play App
Signing you can reset a lost upload key via Google, but losing it is still a hassle.
Place the file at `client/android/upload-keystore.jks`.

### 2. Point the build at it

Copy `client/android/keystore.properties.example` to
`client/android/keystore.properties` and fill in your passwords/alias:

```properties
storeFile=/absolute/path/to/upload-keystore.jks
storePassword=...
keyAlias=...
keyPassword=...        # optional: a PKCS12 keystore uses the store password
```

Both files' secrets are gitignored (`keystore.properties`, `*.jks`, `*.keystore`).
You can also pass the same values as the `ANDROID_KEYSTORE_FILE`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`
environment variables instead.

### 3. Build the signed bundle

```bash
npm run cap:sync          # from client/: rebuild web assets + sync native
cd android
./gradlew bundleRelease   # Windows: .\gradlew.bat bundleRelease
```

Output: `client/android/app/build/outputs/bundle/release/app-release.aab`, the file
you upload to the Play Console.

Or let the helper script do all of it in one go:

```bash
bash scripts/build-android-release.sh
```

It builds the web assets, syncs the Android project, runs `./gradlew bundleRelease`
and **verifies the result is actually signed** before handing it to you. That check
matters: without a keystore the Gradle build still succeeds and silently emits an
*unsigned* bundle, which the store then rejects at upload. Note also that
`assembleRelease` produces an `.apk`, while stores want the `.aab` bundle that
`bundleRelease` produces.

### In CI

The **Android AAB (Play Store)** workflow
([`.github/workflows/android-release.yml`](../.github/workflows/android-release.yml))
builds the same signed `.aab` from four repository secrets
(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`). Run it manually from the Actions tab.

## Deep links (optional)

The app can open `https://<your-server>/join?invite=...` and `/reset-password?token=...`
directly instead of bouncing through the browser. Two steps, both on your own domain:

1. Add an `<intent-filter android:autoVerify="true">` for your host in
   `client/android/app/src/main/AndroidManifest.xml` (see the Android
   [App Links documentation](https://developer.android.com/training/app-links/verify-android-applinks)).
2. Set `ANDROID_CERT_SHA256` (and `ANDROID_PACKAGE_NAME`) on the server so it publishes
   `/.well-known/assetlinks.json` with your signing certificate's fingerprint.

No intent-filter ships by default: it would have to name a domain, and yours is not known
at build time. Without it the links still work, they simply open in the browser.

## Notes

- **Push notifications**: the app reuses the existing **Web Push (VAPID)** — no Firebase
  (keeps it Google‑free). Native UnifiedPush/ntfy can come later.
- **Service worker** is disabled in the native build (`vite build --mode native`); the app
  shell is already local, only API calls go to your server.
- `client/android/` is committed so CI and local builds use the exact same project.
