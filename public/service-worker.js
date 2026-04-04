const CACHE_VERSION = 'v7';
const CACHE_NAME = `cade-meu-bau-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const API_PATTERNS = [
  '/api/',
  'rmtcgoiania.com.br',
  'sitpass',
  'realtimebus',
];

const isApiRequest = (url) => API_PATTERNS.some(p => url.includes(p));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(n => n.startsWith('cade-meu-bau-') && n !== CACHE_NAME)
          .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => new Response(JSON.stringify({ erro: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }))
    );
    return;
  }

  const isNavigate = event.request.mode === 'navigate';
  const isAsset = url.match(/\.(js|css|png|jpg|svg|ico|woff2?)(\?|$)/);

  if (isAsset) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchAndCache = fetch(event.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          }
          return res;
        });
        return cached || fetchAndCache;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.status === 200 && !isNavigate) {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (isNavigate) return caches.match('/index.html');
          return new Response('offline', { status: 503 });
        })
      )
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); }
  catch { data = { title: '🚍 Cadê meu Baú?', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      tag: 'cade-meu-bau-alert',
      renotify: true,
      data: data.data || { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url
    ? self.location.origin + event.notification.data.url
    : self.location.origin + '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.startsWith(self.location.origin));
      if (existing) { existing.navigate(targetUrl); return existing.focus(); }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
