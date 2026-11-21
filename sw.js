/* TOC TOC 1.3.0 — app shell and real, payload-less Web Push. */
importScripts("assets/pwa-store.js?v=1.3.0");
const APP_VERSION = "1.3.0",
  SCOPE = self.registration.scope,
  CACHE_PREFIX = "toc:" + SCOPE + ":",
  CACHE = CACHE_PREFIX + APP_VERSION;
const ASSETS = [
  "./",
  "index.html",
  "admin.html",
  "config.js",
  "manifest.webmanifest",
  "admin.webmanifest",
  "assets/client.css?v=1.3.0",
  "assets/app.css?v=1.3.0",
  "assets/pwa.css?v=1.3.0",
  "assets/client.js?v=1.3.0",
  "assets/admin.js?v=1.3.0",
  "assets/core.js?v=1.3.0",
  "assets/maps.js?v=1.3.0",
  "assets/orders.js?v=1.3.0",
  "assets/demo.js?v=1.3.0",
  "assets/pwa.js?v=1.3.0",
  "assets/pwa-store.js?v=1.3.0",
  "assets/icons.svg",
  "assets/mark.svg",
  "assets/courier-cutout.webp",
  "assets/icons/app-192.png",
  "assets/icons/app-512.png",
  "assets/icons/maskable-512.png",
  "assets/icons/badge-96.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(ASSETS.map((path) => new URL(path, SCOPE).href)),
      ),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url),
    root = new URL(SCOPE);
  if (
    request.method !== "GET" ||
    url.origin !== root.origin ||
    !url.pathname.startsWith(root.pathname)
  )
    return;
  const isPage = request.mode === "navigate",
    isConfig = url.pathname.endsWith("/config.js");
  if (
    !isPage &&
    !isConfig &&
    !/\/(assets\/|manifest\.webmanifest|admin\.webmanifest)/.test(url.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (isPage || isConfig) {
        try {
          const response = await fetch(request);
          if (response.ok)
            await cache.put(
              isPage
                ? new URL(
                    url.pathname.endsWith("admin.html")
                      ? "admin.html"
                      : "index.html",
                    SCOPE,
                  ).href
                : request,
              response.clone(),
            );
          return response;
        } catch {
          const stored = await cache.match(
            isPage
              ? new URL(
                  url.pathname.endsWith("admin.html")
                    ? "admin.html"
                    : "index.html",
                  SCOPE,
                ).href
              : request,
          );
          if (stored) return stored;
          return new Response(
            "Sin conexión. Vuelve a intentarlo al conectarte.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain;charset=utf-8" },
            },
          );
        }
      }
      const stored = await cache.match(request);
      if (stored) return stored;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })(),
  );
});
async function readInbox(config, grant) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "pushInbox",
        data: {
          id: grant.id,
          token: grant.token,
          since: grant.checkedAt || Date.now() - 86400000,
        },
        session: "",
      }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!result.ok) return [];
    grant.checkedAt = result.data.checkedAt;
    await TocPwaStore.put(SCOPE, "grant:" + grant.scope, grant);
    return result.data.notifications || [];
  } finally {
    clearTimeout(timer);
  }
}
self.addEventListener("push", (event) =>
  event.waitUntil(
    (async () => {
      let notifications = [],
        fallbackPath = "index.html";
      try {
        const config = await TocPwaStore.get(SCOPE, "config");
        if (config?.apiUrl) {
          const grants = (
            await Promise.all(
              ["admin", "client"].map((scope) =>
                TocPwaStore.get(SCOPE, "grant:" + scope),
              ),
            )
          ).filter((g) => g && new Date(g.expiresAt).getTime() > Date.now());
          if (grants.some((g) => g.scope === "admin"))
            fallbackPath = "admin.html#inbox";
          const all = await Promise.allSettled(
            grants.map((g) => readInbox(config, g)),
          );
          for (const result of all)
            if (result.status === "fulfilled")
              notifications.push(...result.value);
        }
      } catch {
        /* A visible fallback is required even if the data connection fails. */
      }
      const seen =
          (await TocPwaStore.get(SCOPE, "seen").catch(() => ({}))) || {},
        byTag = {};
      for (const notification of notifications)
        if (!seen[notification.id]) byTag[notification.tag] = notification;
      notifications = Object.values(byTag).slice(-3);
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const visible = windows.some(
        (client) =>
          client.url.startsWith(SCOPE) && client.visibilityState === "visible",
      );
      if (!notifications.length)
        notifications = [
          {
            title: "TOC TOC",
            body: "Hay novedades. Abre la aplicación para consultar tus servicios.",
            tag: "toc-update",
            path: fallbackPath,
          },
        ];
      for (const n of notifications) {
        await self.registration.showNotification(n.title, {
          body: n.body,
          tag: n.tag,
          icon: new URL("assets/icons/app-192.png", SCOPE).href,
          badge: new URL("assets/icons/badge-96.png", SCOPE).href,
          data: { url: new URL(n.path || "index.html", SCOPE).href },
          silent: visible,
          requireInteraction:
            !visible && String(n.path).startsWith("admin.html"),
        });
        if (n.id) seen[n.id] = Date.now();
      }
      const recent = Object.entries(seen)
        .filter(([, at]) => Date.now() - at < 7 * 86400000)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 500);
      await TocPwaStore.put(SCOPE, "seen", Object.fromEntries(recent)).catch(
        () => {},
      );
    })(),
  ),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      let target = new URL(event.notification.data?.url || "index.html", SCOPE);
      if (
        target.origin !== new URL(SCOPE).origin ||
        !target.href.startsWith(SCOPE)
      )
        target = new URL("index.html", SCOPE);
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows)
        if (
          client.url.startsWith(SCOPE) &&
          new URL(client.url).pathname === target.pathname
        ) {
          await client.navigate(target.href);
          return client.focus();
        }
      return self.clients.openWindow(target.href);
    })(),
  );
});
