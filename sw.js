/* 本文件由 scripts/build.mjs 自动生成，请勿手改 */
const CACHE = 'tools-6d93762021';
const PRECACHE = [
  "apps/cat-insulin-app/index.html",
  "icon.svg",
  "index.html",
  "manifest.json"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 同一个页面可能有 /、/index.html、/apps/x/、/apps/x/index.html 几种地址，都兜住
function matchCached(request) {
  return caches.match(request, { ignoreSearch: true }).then((hit) => {
    if (hit) return hit;
    const url = new URL(request.url);
    if (url.pathname.endsWith('/')) return caches.match(url.pathname + 'index.html');
    if (!/\.[a-z0-9]+$/i.test(url.pathname)) return caches.match(url.pathname + '/index.html');
    return undefined;
  });
}

// 先给缓存（离线可用），同时后台拉最新版本更新缓存
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    matchCached(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => undefined);
      if (cached) return cached;
      return network.then((response) => response || new Response('离线中，这个页面还没有缓存过。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }));
    })
  );
});
