// Service worker – caches the app so it opens with no signal.
// Bump CACHE_VERSION whenever you change any app file (config.js, checklist.js, etc.).
const CACHE_VERSION = "washbay-v1.1.1";
const ASSETS = ["./", "index.html", "app.css", "app.js", "config.js", "checklist.js",
  "lib/msal-browser.min.js", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Same-origin GETs: network first (so updates arrive when online), fall back to cache offline.
// Everything else (Microsoft login, Graph, Power Automate) goes straight to the network.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);           // patchy signal: don't hang
      const res = await fetch(req, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html"));
    }
  })());
});
