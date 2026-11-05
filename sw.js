const CACHE_NAME = 'nina-creative-pwa-github-v17';
const BASE_PATH = new URL('./', self.registration.scope).pathname;
const CORE_ASSETS = [
  'index.html',
  'manifest.webmanifest',
  'labo-reference.png',
  'pwa-icon-192.png',
  'pwa-icon-512.png',
  'pwa-maskable-512.png',
  'apple-touch-icon.png',
  'site-background.png'
];

function resolveAsset(asset) {
  return new URL(asset, self.registration.scope);
}

async function cacheResponse(cache, requestUrl, response) {
  await cache.put(requestUrl, response.clone());
  const url = new URL(requestUrl, self.location.origin);
  if (url.search) await cache.put(url.pathname, response.clone());
}

async function cacheAsset(cache, asset) {
  const response = await fetch(asset, { cache: 'reload' });
  if (!response.ok) throw new Error(`Unable to cache ${asset.pathname}.`);
  await cacheResponse(cache, asset, response);
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexUrl = resolveAsset('index.html');
  const indexResponse = await fetch(indexUrl, { cache: 'reload' });
  if (!indexResponse.ok) throw new Error('Unable to cache the app shell.');

  const indexText = await indexResponse.clone().text();
  await Promise.all([
    cache.put(BASE_PATH, indexResponse.clone()),
    cache.put(indexUrl, indexResponse.clone())
  ]);

  const discoveredAssets = [...indexText.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(([, value]) => resolveAsset(value))
    .filter(url => url.origin === self.location.origin)
    .map(url => url.toString());

  const coreAssets = [...new Set(CORE_ASSETS.map(resolveAsset))];
  const optionalAssets = [...new Set(discoveredAssets)]
    .filter(asset => !coreAssets.some(core => core.href === asset.href));

  // The app shell must be complete before activation; optional discovered assets
  // should not prevent an otherwise usable offline app from installing.
  await Promise.all(coreAssets.map(asset => cacheAsset(cache, asset)));
  await Promise.allSettled(optionalAssets.map(asset => cacheAsset(cache, asset)));
}

self.addEventListener('install', event => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting())
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
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok) await cacheResponse(cache, cacheKey, response);
      return response;
    } catch (_) {
      const requestPath = new URL(event.request.url).pathname;
      const cached = await cache.match(cacheKey) || await cache.match(requestPath);
      if (cached) return cached;
      return new Response('离线资源尚未准备完成。请先联网打开 Nina Creative 一次，再从手机桌面进入。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
