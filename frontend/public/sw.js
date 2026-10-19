/* سابقه‌نو — service worker.
   SECURITY RULE: nothing from /api/ is ever cached or touched here. Credit data and national IDs
   must never be written to the phone's cache. Only the static app shell is cached. */
const VERSION = "v1-2026-10-18";
const PREFIX = "sabegheno-app-";
const SHELL = PREFIX + "shell-" + VERSION;
const ASSETS = PREFIX + "assets-" + VERSION;
const PRECACHE = ["/offline.html", "/offline.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  // no skipWaiting here: the page shows "new version ready" and asks the user (so a form is never lost mid-typing)
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== SHELL && k !== ASSETS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;                       // never cache the API

  // page loads: always the live site; if there is no network, a friendly offline page
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // hashed build files never change → cache-first
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  // the few shell files: cache-first with the network as fallback
  if (PRECACHE.includes(url.pathname)) e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
