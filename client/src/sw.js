/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = /** @type {ServiceWorkerGlobalScope} */ (self);

// vite-plugin-pwa injectManifest requires this reference.
// We use it to pre-cache static assets on install.
const precacheManifest = sw.__WB_MANIFEST;

const CACHE_NAME = 'openfamily-v1';

sw.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            const urls = precacheManifest
                .filter((entry) => entry.url && !entry.url.startsWith('http'))
                .map((entry) => entry.url);
            return cache.addAll(urls).catch(() => {
                // Ignore individual failures (missing assets, etc.)
            });
        }).then(() => sw.skipWaiting())
    );
});

sw.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => sw.clients.claim())
    );
});

sw.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('/api/')) return; // Never cache API calls

    event.respondWith(
        caches.match(event.request).then((cached) => cached ?? fetch(event.request))
    );
});

// ── Push notifications ───────────────────────────────────────────────────────

sw.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: 'OpenFamily', body: event.data.text() };
    }

    const title = payload.title ?? 'OpenFamily';
    const options = {
        body: payload.body ?? '',
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        tag: payload.tag ?? 'openfamily',
        data: { url: payload.url ?? '/' },
        requireInteraction: false,
        vibrate: [200, 100, 200],
    };

    event.waitUntil(sw.registration.showNotification(title, options));
});

sw.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url ?? '/';

    event.waitUntil(
        sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    void client.focus();
                    void client.navigate(url);
                    return;
                }
            }
            return sw.clients.openWindow(url);
        })
    );
});
