const CACHE = 'rtb-v1';

const SHELL = [
  '/iron-log/',
  '/iron-log/index.html',
  '/iron-log/manifest.webmanifest',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  // Do NOT skipWaiting — wait for user to approve the reload via the banner.
});

// ── Message: app triggers skip when user taps "Refresh" ───────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Activate: prune old caches, claim all clients ─────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Pass through all cross-origin requests (Google APIs, YouTube, CDNs)
  if (url.origin !== self.location.origin) return;

  // Vite hashed assets (/assets/*.js, /assets/*.css) — cache-first.
  // These filenames are content-addressed so old ones never collide with new ones.
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(r => {
          if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
      )
    );
    return;
  }

  // Everything else (index.html, manifest, icons, library.csv, …) — network-first.
  // This ensures a fresh index.html is always served when online, so deploys
  // are picked up on the next page open without any manual refresh prompt.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() =>
        caches.match(e.request).then(cached =>
          cached ||
          (e.request.mode === 'navigate'
            ? caches.match('/iron-log/index.html')
            : new Response('Offline', { status: 503, statusText: 'Service Unavailable' }))
        )
      )
  );
});
