const CACHE_NAME = "ready-order-v4";
const APP_SHELL = ["/", "/manifest.webmanifest"];
const LOG_PREFIX = "[ReadyOrderPush:SW]";

self.addEventListener("install", (event) => {
  console.info(LOG_PREFIX, "install", { cache: CACHE_NAME });
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.info(LOG_PREFIX, "activate", { cache: CACHE_NAME });
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  console.info(LOG_PREFIX, "message", event.data);
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  const rawText = event.data?.text() || "";

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {
      title: "Order update",
      body: rawText || "Your order has an update"
    };
  }

  const title = data.title || "Order update";
  const options = {
    body: data.body || "Your order has an update",
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    tag: data.tag || `ready-order-${Date.now()}`,
    renotify: true,
    silent: false,
    timestamp: data.timestamp || Date.now(),
    requireInteraction: data.requireInteraction ?? true,
    vibrate: [120, 70, 120],
    data: {
      url: data.url || "/"
    }
  };

  console.info(LOG_PREFIX, "push received", {
    rawText,
    parsed: data,
    title,
    options
  });

  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => {
        console.info(LOG_PREFIX, "showNotification success", { title, tag: options.tag });
      })
      .catch((error) => {
        console.error(LOG_PREFIX, "showNotification error", {
          name: error?.name,
          message: error?.message,
          stack: error?.stack
        });
        throw error;
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  console.info(LOG_PREFIX, "notificationclick", {
    tag: event.notification?.tag,
    data: event.notification?.data
  });
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const appClient = clients.find((client) => new URL(client.url).pathname === url);

      if (appClient) {
        appClient.focus();
        return;
      }

      return self.clients.openWindow(url);
    })
  );
});
