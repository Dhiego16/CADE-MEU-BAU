const CACHE_NAME = 'cade-meu-bau-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  'https://cdn.tailwindcss.com'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Ativação - limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepta requests - Network First (sempre tenta rede primeiro)
self.addEventListener('fetch', (event) => {
  // Ignora requests que não são GET
  if (event.request.method !== 'GET') return;
  
  // Ignora requests pra API (sempre busca dados frescos)
  if (event.request.url.includes('bot-onibus.vercel.app')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se conseguiu da rede, atualiza o cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Se falhou, tenta pegar do cache
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // Se não tem no cache, retorna página offline
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Mensagens do app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
