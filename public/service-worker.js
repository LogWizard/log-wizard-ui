const CACHE_NAME = 'log-wizard-v3';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './vite.svg'
];

self.addEventListener('install', (event) => {
    // 🌿 Skip wait to activate immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // 🌿 Claim clients immediately
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // 🌿 Network First strategy for API/Dynamic content
    // But for static assets, we could do Cache First.
    // For now, let's keep it simple: Network Only or Network First to avoid stale data issues.
    // Actually, user just wants "Install App", so offline capability isn't the main goal, but IS required for PWA.
    // We'll use a simple fetch handler that doesn't block updates.

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Try caching fallback with current location base path
                return caches.match('./index.html').then(response => {
                    return response || fetch('./index.html');
                });
            })
        );
    }
});
