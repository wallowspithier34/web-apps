const CACHE = "chess-v14";
const OLD_CACHES = ["chess-v1", "chess-v2", "chess-v3", "chess-v4", "chess-v5", "chess-v6", "chess-v7", "chess-v8", "chess-v9", "chess-v10", "chess-v11", "chess-v12", "chess-v13"];

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
    "./stockfish.js",
    "./opening-detect.js",
    "./export.js",
    "./home.js",
    "./play.js",
    "./trainer.js",
    "./library.js",
    // Pixel pieces (Lichess pixel set)
    "./pieces/pixel/wK.svg", "./pieces/pixel/wQ.svg", "./pieces/pixel/wR.svg",
    "./pieces/pixel/wB.svg", "./pieces/pixel/wN.svg", "./pieces/pixel/wP.svg",
    "./pieces/pixel/bK.svg", "./pieces/pixel/bQ.svg", "./pieces/pixel/bR.svg",
    "./pieces/pixel/bB.svg", "./pieces/pixel/bN.svg", "./pieces/pixel/bP.svg",
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
    // Shaded pieces (pixel-art PNG)
    "./pieces/shaded/wK.png", "./pieces/shaded/wQ.png", "./pieces/shaded/wR.png",
    "./pieces/shaded/wB.png", "./pieces/shaded/wN.png", "./pieces/shaded/wP.png",
    "./pieces/shaded/bK.png", "./pieces/shaded/bQ.png", "./pieces/shaded/bR.png",
    "./pieces/shaded/bB.png", "./pieces/shaded/bN.png", "./pieces/shaded/bP.png",
    // Flat pieces (pixel-art PNG)
    "./pieces/flat/wK.png", "./pieces/flat/wQ.png", "./pieces/flat/wR.png",
    "./pieces/flat/wB.png", "./pieces/flat/wN.png", "./pieces/flat/wP.png",
    "./pieces/flat/bK.png", "./pieces/flat/bQ.png", "./pieces/flat/bR.png",
    "./pieces/flat/bB.png", "./pieces/flat/bN.png", "./pieces/flat/bP.png",
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
