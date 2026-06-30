import type { CapacitorConfig } from '@capacitor/cli';

// The native shell loads the bundled web build (webDir) and talks to the user's
// own self-hosted server (configured at runtime, see src/lib/serverConfig.ts).
// `androidScheme: 'http'` + cleartext so plain-HTTP LAN servers work out of the
// box; HTTPS / Tailscale servers work too.
const config: CapacitorConfig = {
    appId: 'fr.nexaflow.openfamily',
    appName: 'OpenFamily',
    webDir: 'dist',
    server: {
        androidScheme: 'http',
        cleartext: true,
    },
    android: {
        allowMixedContent: true,
    },
};

export default config;
