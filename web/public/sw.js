// Minimal app-shell service worker (blueprint §37's "installable PWA").
// Deliberately narrow: it never caches API responses (this is a live,
// permission-scoped ERP, not a static site — stale financial data offline
// would be actively misleading), only the offline fallback page itself.
const CACHE = "sttps-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});
