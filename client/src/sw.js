/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = /** @type {ServiceWorkerGlobalScope} */ (self);

// workbox-build (injectManifest) searches for the LITERAL string self.__WB_MANIFEST.
// Must reference self directly here; aliased access (sw.__WB_MANIFEST) is not detected.
// eslint-disable-next-line no-undef
const precacheManifest = self.__WB_MANIFEST;

// Versionne les caches : un changement de version purge automatiquement les
// anciens caches a l'activation (voir handler 'activate'). Indispensable pour
// eviter qu'un ancien bundle (ex. pointant vers une mauvaise URL d'API) reste
// servi indefiniment apres une mise a jour de l'application.
const CACHE_NAME = 'openfamily-v3';
const API_CACHE_NAME = 'openfamily-api-v3';
const OFFLINE_URL = '/index.html';

sw.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            const urls = precacheManifest
                .filter((entry) => entry.url && !entry.url.startsWith('http'))
                .map((entry) => entry.url);
            // Always keep the app shell available for offline navigation.
            if (!urls.includes(OFFLINE_URL)) urls.push(OFFLINE_URL);
            return cache.addAll(urls).catch(() => {
                // Ignore individual failures (missing assets, etc.)
            });
        }).then(() => sw.skipWaiting())
    );
});

sw.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
                    .map((k) => caches.delete(k))
            )
        ).then(() => sw.clients.claim())
    );
});

sw.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // App navigations: try the network first, fall back to the cached shell when offline.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() =>
                caches.match(request).then((cached) => cached ?? caches.match(OFFLINE_URL))
            )
        );
        return;
    }

    // API reads: network-first with a cache fallback so data stays viewable offline.
    if (url.pathname.includes('/api/')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(API_CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() =>
                    caches.match(request).then((cached) => {
                        if (cached) return cached;
                        return new Response(
                            JSON.stringify({ success: false, error: 'offline', offline: true }),
                            { status: 503, headers: { 'Content-Type': 'application/json' } }
                        );
                    })
                )
        );
        return;
    }

    // Static assets: cache-first.
    event.respondWith(
        caches.match(request).then((cached) => cached ?? fetch(request))
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
