const CACHE_NAME = 'nina-creative-pwa-github-v1';
const BASE_PATH = new URL('./', self.registration.scope).pathname;
const CORE_ASSETS = [
  `${BASE_PATH}index.html`,
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}labo-reference.png`,
  `${BASE_PATH}pwa-icon-192.png`,
  `${BASE_PATH}pwa-icon-512.png`,
  `${BASE_PATH}pwa-maskable-512.png`,
  `${BASE_PATH}apple-touch-icon.png`,
  `${BASE_PATH}site-background-mobile.png`
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch(`${BASE_PATH}index.html`, { cache: 'reload' });
  if (!indexResponse.ok) throw new Error('Unable to cache the app shell.');

  const indexText = await indexResponse.clone().text();
  await Promise.all([
    cache.put(BASE_PATH, indexResponse.clone()),
    cache.put(`${BASE_PATH}index.html`, indexResponse.clone())
  ]);

  const discoveredAssets = [...indexText.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(([, value]) => new URL(value, self.location.origin))
    .filter(url => url.origin === self.location.origin)
    .map(url => `${url.pathname}${url.search}`);

  const assets = [...new Set([...CORE_ASSETS, ...discoveredAssets])];
  await Promise.allSettled(assets.map(async asset => {
    const response = await fetch(asset, { cache: 'reload' });
    if (response.ok) await cache.put(asset, response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(
    cacheAppShell()
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = event.request.mode === 'navigate' ? `${BASE_PATH}index.html` : event.request;
    const cached = await cache.match(cacheKey);

    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(cacheKey, response.clone());
      return response;
    } catch (_) {
      return new Response('离线资源尚未准备完成。请先联网打开 Nina Creative 一次，再从手机桌面进入。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
