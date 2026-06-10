import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// The static GitHub Pages demo is served from a sub-path and must not register
// a service worker (it would cache the demo as if it were the real app).
const isDemo = process.env.VITE_DEMO === 'true';

export default defineConfig({
    base: isDemo ? '/OpenFamily/demo/' : '/',
    plugins: [
        react(),
        ...(isDemo ? [] : [VitePWA({
            registerType: 'autoUpdate',
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.js',
            includeAssets: ['favicon-32x32.png', 'favicon-16x16.png', 'apple-touch-icon.png', 'OpenFamily.png'],
            manifest: {
                name: 'OpenFamily',
                short_name: 'OpenFamily',
                description: 'Application de gestion familiale',
                theme_color: '#DC4A60',
                background_color: '#F7F2E9',
                display: 'standalone',
                icons: [
                    {
                        src: '/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            devOptions: {
                enabled: false,
            },
        })])
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: process.env.VITE_API_URL || 'http://localhost:3001',
                changeOrigin: true
            }
        }
    }
});
