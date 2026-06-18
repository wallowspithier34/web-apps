const CACHE = "chess-openings-v3";
const ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./chess.js",
    "./openings.js",
    "./srs.js",
    "./app.js",
    "./icon.svg",
    "./manifest.json"
];

// Bundled traditional piece sets (rendered via <img>) — cache for offline use.
for (const set of ["cburnett", "merida", "maestro"]) {
    for (const p of ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"]) {
        ASSETS.push(`./pieces/${set}/${p}.svg`);
    }
}

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
