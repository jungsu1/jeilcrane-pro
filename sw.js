const CACHE_NAME = "jeilcrane-pro-locked-v1";
const LOCKED_PAGE = "./index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(["./", LOCKED_PAGE]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(LOCKED_PAGE, { cache: "no-store" })
        .catch(() => caches.match(LOCKED_PAGE))
    );
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .catch(() => caches.match(event.request))
  );
});
