const CACHE = "analog-clock";
const ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./script.js",
    "./icon.svg",
    "./manifest.json"
];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    self.clients.claim();
});

// Network-first: bypass HTTP cache, update SW cache, fall back to SW cache offline
self.addEventListener("fetch", (e) => {
    const req = new Request(e.request, { cache: "reload" });
    e.respondWith(
        fetch(req)
            .then((response) => {
                const clone = response.clone();
                caches.open(CACHE).then((c) => c.put(e.request, clone));
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});
