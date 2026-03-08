const CACHE = "maghrib-countdown-v1";

// Cache all app files on install
self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE).then((c) =>
            c.addAll(["./", "./index.html", "./styles.css", "./script.js", "./manifest.json", "./icon.svg"])
        )
    );
});

// Network-first: always try to fetch fresh, fall back to cache offline
self.addEventListener("fetch", (e) => {
    const req = new Request(e.request, { cache: "reload" }); // bypass HTTP cache
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
