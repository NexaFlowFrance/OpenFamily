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
debug‑signed `OpenFamily.apk` (sideload‑installable) and attaches it to the Release.

### Locally
Prerequisites: Node 20+, JDK 21, Android SDK (Android Studio).

```bash
npm run install:all
npm run build:shared
cd client
npm run android:add     # first time only — generates client/android/ (commit it for F-Droid)
npm run cap:sync        # build:native + cap sync
npm run android:open    # open in Android Studio → Run / Build APK
# or a one-liner onto a connected device/emulator:
npm run android:run
```

The debug APK lands at `client/android/app/build/outputs/apk/debug/app-debug.apk`.

## Release signing (only for the Play Store)

F-Droid and sideloaded debug APKs don't need this. For a Play Store upload, create a
keystore and configure `client/android/app/build.gradle` signing (or pass it via the
workflow as base64 secrets), then `./gradlew assembleRelease`.

## Notes

- **Push notifications**: the app reuses the existing **Web Push (VAPID)** — no Firebase
  (keeps it Google‑free, which matters for F-Droid). Native UnifiedPush/ntfy can come later.
- **Service worker** is disabled in the native build (`vite build --mode native`); the app
  shell is already local, only API calls go to your server.
- Commit `client/android/` once generated — F-Droid builds the app from it.
