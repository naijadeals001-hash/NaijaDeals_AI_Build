/* NaijaDeals service worker.
 *
 * Caching rules, deliberately narrow:
 *  - Navigation requests: network-first, falling back to the offline page. Pages
 *    are personalised, so a page is never served from cache to a different user.
 *  - Static assets (icons, generated images, build files): cache-first.
 *  - Everything under /api, /admin, /wallet, /checkout, /pay and any non-GET
 *    request is passed straight through and never cached. Financial and private
 *    responses must never be replayed from a cache.
 *
 * The worker never retries a payment, transfer or booking by itself; those have
 * server-side idempotency and must be re-initiated by the user.
 */
const VERSION = "naijadeals-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";

const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/manifest.webmanifest"
];

/** Paths that must never touch the cache. */
const PRIVATE_PREFIXES = ["/api/", "/admin", "/super-admin", "/wallet", "/checkout", "/pay", "/login", "/register", "/account", "/seller", "/driver", "/courier"];

self.addEventListener("install", (event) => {
  // Precache only. A worker that replaces an existing one stays in `waiting`
  // until the page posts SKIP_WAITING (the user accepts the update banner), so
  // a background update never interrupts an in-flight navigation. A first
  // install has no active worker, so it activates and claims normally.
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

function isPrivate(url) {
  return PRIVATE_PREFIXES.some((prefix) => url.pathname === prefix.replace(/\/$/, "") || url.pathname.startsWith(prefix));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/generated/") ||
    /\.(png|jpe?g|webp|avif|svg|woff2?|css|js|mjs)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return offline ?? new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
        })
    );
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Only store successful, complete, same-origin responses.
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
    })
  );
});

// The page asks for this when the user accepts an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
