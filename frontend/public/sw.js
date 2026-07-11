/* AIMETEO service worker v2 — offline reale (best-effort, mai dati stantii
   spacciati per freschi: rete prima, cache come fallback dichiarato).
   - Tiles mappa: cache-first, limite alto (download gite offline)
   - Asset statici same-origin: stale-while-revalidate
   - Pagine + API (anche cross-origin, es. backend :8000): network-first
     con fallback cache — l'ultima copia buona resta consultabile in rifugio.
   - Messaggio CACHE_URLS dal client: precache esplicito ("Salva per offline"). */
const VER = "aimeteo-v2";
const TILE_HOSTS = ["basemaps.cartocdn.com", "tile.opentopomap.org"];
const MAX_TILES = 2000;

self.addEventListener("install", () => self.skipWaiting());
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

// Precache esplicito dal client (bottone "Salva per offline").
self.addEventListener("message", (e) => {
  if (e.data?.type !== "CACHE_URLS" || !Array.isArray(e.data.urls)) return;
  const { urls, bucket } = e.data;
  e.waitUntil((async () => {
    const cache = await caches.open(`${VER}-${bucket || "offline"}`);
    let ok = 0;
    for (const u of urls) {
      try {
        const res = await fetch(u, { mode: "cors" });
        if (res.ok) { await cache.put(u, res); ok++; }
      } catch { /* singolo fallimento non blocca il resto */ }
    }
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: "CACHE_DONE", ok, total: urls.length, bucket }));
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

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

  // Pagine + API (same e cross-origin): network-first, fallback ultima copia.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type !== "opaque") {
          const copy = res.clone();
          caches.open(`${VER}-data`).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        throw new Error("offline");
      })
  );
});
