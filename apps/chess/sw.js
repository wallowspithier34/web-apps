const CACHE = "chess-v1";
const ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./chess.js",
    "./script.js",
    "./icon.svg",
    "./manifest.json"
];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", () => { self.clients.claim(); });

// Network-first, fall back to cache for offline use
self.addEventListener("fetch", (e) => {
    const req = new Request(e.request, { cache: "reload" });
    e.respondWith(
        fetch(req)
            .then((r) => { caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; })
            .catch(() => caches.match(e.request))
    );
});
