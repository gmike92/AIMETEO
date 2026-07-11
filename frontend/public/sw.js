/* AIMETEO service worker v1 — conservative caching.
   - App shell/static assets & map tiles: cache-first (bounded)
   - API & everything else: network-first with cache fallback
   Weather/bulletin data must stay FRESH: never served stale silently when
   the network is up. Offline = best-effort last known copy. */
const VER = "aimeteo-v1";
const TILE_HOSTS = ["basemaps.cartocdn.com", "tile.opentopomap.org"];
const MAX_TILES = 400;

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VER)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Map tiles: cache-first (they're immutable enough), bounded cache.
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    e.respondWith(
      caches.open(`${VER}-tiles`).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) {
          cache.put(e.request, res.clone());
          trimCache(`${VER}-tiles`, MAX_TILES);
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === location.origin && /\.(js|css|png|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(`${VER}-static`).then(async (cache) => {
        const hit = await cache.match(e.request);
        const net = fetch(e.request).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Everything else (pages, API, weather): network-first, cached fallback.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(`${VER}-pages`).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
