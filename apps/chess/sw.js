const CACHE = "chess-v2";
const OLD_CACHES = ["chess-v1"];

const ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./manifest.json",
    "./icon.svg",
    "./chess.js",
    "./openings.js",
    "./srs.js",
    "./board.js",
    "./elo.js",
    "./timer.js",
    "./bot.js",
    "./opening-detect.js",
    "./export.js",
    "./home.js",
    "./play.js",
    "./trainer.js",
    "./library.js",
    // CBurnett pieces
    "./pieces/cburnett/wK.svg", "./pieces/cburnett/wQ.svg", "./pieces/cburnett/wR.svg",
    "./pieces/cburnett/wB.svg", "./pieces/cburnett/wN.svg", "./pieces/cburnett/wP.svg",
    "./pieces/cburnett/bK.svg", "./pieces/cburnett/bQ.svg", "./pieces/cburnett/bR.svg",
    "./pieces/cburnett/bB.svg", "./pieces/cburnett/bN.svg", "./pieces/cburnett/bP.svg",
    // Merida pieces
    "./pieces/merida/wK.svg", "./pieces/merida/wQ.svg", "./pieces/merida/wR.svg",
    "./pieces/merida/wB.svg", "./pieces/merida/wN.svg", "./pieces/merida/wP.svg",
    "./pieces/merida/bK.svg", "./pieces/merida/bQ.svg", "./pieces/merida/bR.svg",
    "./pieces/merida/bB.svg", "./pieces/merida/bN.svg", "./pieces/merida/bP.svg",
    // Maestro pieces
    "./pieces/maestro/wK.svg", "./pieces/maestro/wQ.svg", "./pieces/maestro/wR.svg",
    "./pieces/maestro/wB.svg", "./pieces/maestro/wN.svg", "./pieces/maestro/wP.svg",
    "./pieces/maestro/bK.svg", "./pieces/maestro/bQ.svg", "./pieces/maestro/bR.svg",
    "./pieces/maestro/bB.svg", "./pieces/maestro/bN.svg", "./pieces/maestro/bP.svg",
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => OLD_CACHES.includes(k))
                    .map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;
    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin) return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((resp) => {
                if (resp.ok) {
                    const clone = resp.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, clone));
                }
                return resp;
            });
        })
    );
});
