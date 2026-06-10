/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_WS_URL: string;
    readonly VITE_DEMO?: string;
    readonly VITE_REGISTRATION_ENABLED?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
