const CACHE_NAME = "veil-v1";

const APP_SHELL = [
    "/",
    "/index.html",
    "/manifest.json",
    "/offline.html",
    "/icons/icon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png"
];


/*
 * Install
 */
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
    );

    self.skipWaiting();
});


/*
 * Activate
 */
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );

    self.clients.claim();
});


/*
 * Navigation requests
 *
 * Online:
 *     Load normally.
 *
 * Offline:
 *     Show offline.html.
 */
self.addEventListener("fetch", (event) => {

    if (event.request.method !== "GET") {
        return;
    }

    const requestURL = new URL(event.request.url);

    /*
     * Only handle requests belonging
     * to the Veil PWA itself.
     */
    if (requestURL.origin !== self.location.origin) {
        return;
    }

    /*
     * Page navigation.
     */
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match("/offline.html");
                })
        );

        return;
    }

    /*
     * Local assets.
     */
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
    );
});
