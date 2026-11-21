/* TocToc 1.3.5 — app shell and real, payload-less Web Push. */
importScripts("assets/pwa-store.js?v=1.3.5");
const APP_VERSION = "1.3.5",
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
  "assets/client.css?v=1.3.5",
  "assets/app.css?v=1.3.5",
  "assets/pwa.css?v=1.3.5",
  "assets/client.js?v=1.3.5",
  "assets/admin.js?v=1.3.5",
  "assets/core.js?v=1.3.5",
  "assets/audio.js?v=1.3.5",
  "assets/maps.js?v=1.3.5",
  "assets/orders.js?v=1.3.5",
  "assets/demo.js?v=1.3.5",
  "assets/pwa.js?v=1.3.5",
  "assets/pwa-store.js?v=1.3.5",
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
          const response = await fetch(
            request,
            isConfig ? { cache: "no-cache" } : undefined,
          );
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
    if (!result.ok) return null;
    const key =
      grant.scope === "client"
        ? "client-grant:" + grant.requestId
        : "grant:admin";
    return {
      key,
      grant,
      checkedAt: result.data.checkedAt,
      notifications: (result.data.notifications || []).map((n) => ({
        ...n,
        grantId: grant.id,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}
self.addEventListener("push", (event) =>
  event.waitUntil(
    (async () => {
      let notifications = [],
        inboxes = [],
        fallbackPath = "index.html";
      try {
        let direct = null;
        try {
          const payload = event.data?.json();
          const n = payload?.notification;
          if (
            payload?.v === 1 &&
            n &&
            ["client", "admin"].includes(n.scope) &&
            typeof n.title === "string" &&
            n.title.length <= 160 &&
            typeof n.body === "string" &&
            n.body.length <= 600 &&
            /^[a-f0-9]{64}$/.test(n.grantId) &&
            /^(index\.html|admin\.html)(#.*)?$/.test(n.path)
          )
            direct = n;
        } catch {}
        const config = await TocPwaStore.get(SCOPE, "config");
        if (config?.apiUrl) {
          const saved = await TocPwaStore.entries(SCOPE, "client-grant:");
          const legacy = await TocPwaStore.get(SCOPE, "grant:client");
          const admin = await TocPwaStore.get(SCOPE, "grant:admin");
          const grants = [
            ...new Map(
              [admin, legacy, ...saved.map(([, g]) => g)]
                .filter(
                  (g) => g && new Date(g.expiresAt).getTime() > Date.now(),
                )
                .map((g) => [g.id, g]),
            ).values(),
          ];
          if (grants.some((g) => g.scope === "admin"))
            fallbackPath = "admin.html#inbox";
          if (direct) {
            if (direct.scope === "client" && direct.revision) {
              const previous = await TocPwaStore.get(
                SCOPE,
                "notification:" + direct.requestId,
              );
              if (previous && previous.revision > direct.revision)
                direct = previous;
            }
            notifications.push(direct);
            for (const grant of grants)
              if (grant.id === direct.grantId)
                inboxes.push({
                  grant,
                  key:
                    grant.scope === "client"
                      ? "client-grant:" + grant.requestId
                      : "grant:admin",
                  checkedAt: Date.now(),
                  notifications: [direct],
                });
          } else {
            const all = await Promise.allSettled(
              grants.map((g) => readInbox(config, g)),
            );
            for (const result of all)
              if (result.status === "fulfilled" && result.value) {
                inboxes.push(result.value);
                notifications.push(...result.value.notifications);
              }
          }
        }
      } catch {
        /* A visible fallback is required even if the data connection fails. */
      }
      const seen =
          (await TocPwaStore.get(SCOPE, "seen").catch(() => ({}))) || {},
        byTag = {};
      const repeated = notifications.at(-1);
      for (const notification of notifications)
        if (!seen[notification.id]) byTag[notification.tag] = notification;
      notifications = Object.values(byTag);
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (!notifications.length)
        notifications = [
          repeated
            ? { ...repeated, duplicate: true }
            : {
                title: "TocToc",
                body: "Hay novedades. Abre la aplicación para consultar tus servicios.",
                tag: "toc-update",
                path: fallbackPath,
              },
        ];
      const displayed = new Set();
      for (const n of notifications) {
        const audible = await pagePlaysAlert(windows, n);
        await self.registration.showNotification(n.title, {
          body: n.body,
          tag: n.tag,
          icon: new URL("assets/icons/app-192.png", SCOPE).href,
          badge: new URL("assets/icons/badge-96.png", SCOPE).href,
          data: { url: new URL(n.path || "index.html", SCOPE).href },
          silent: audible || n.duplicate === true,
          renotify: !audible && !n.duplicate,
          vibrate: audible || n.duplicate ? [] : [180, 80, 180],
          requireInteraction:
            !audible && String(n.path).startsWith("admin.html"),
        });
        if (n.id) seen[n.id] = Date.now();
        if (n.grantId) displayed.add(n.grantId);
        if (n.scope === "client" && n.revision)
          await TocPwaStore.put(SCOPE, "notification:" + n.requestId, n);
      }
      // Commit inbox progress only after showNotification succeeded.
      for (const inbox of inboxes) {
        const latest = await TocPwaStore.get(SCOPE, inbox.key);
        if (
          latest?.id === inbox.grant.id &&
          latest.token === inbox.grant.token
        ) {
          latest.checkedAt = inbox.checkedAt;
          await TocPwaStore.put(SCOPE, inbox.key, latest);
        }
        if (displayed.has(inbox.grant.id)) {
          await reportShown(inbox.grant);
          for (const client of windows)
            if (client.url.startsWith(SCOPE))
              client.postMessage({
                type: "TOC_PUSH_RECEIVED",
                scope: inbox.grant.scope,
              });
        }
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
async function reportShown(grant) {
  const config = await TocPwaStore.get(SCOPE, "config"),
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(config.apiUrl, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "pushReceived",
        data: { id: grant.id, token: grant.token },
        session: "",
      }),
      signal: controller.signal,
    });
  } catch {
  } finally {
    clearTimeout(timer);
  }
}
async function pagePlaysAlert(windows, notification) {
  if (!notification.alertKey) return false;
  const expected = notification.scope === "admin" ? "admin.html" : "index.html";
  const candidates = windows.filter(
    (c) =>
      c.url.startsWith(SCOPE) &&
      c.visibilityState === "visible" &&
      (new URL(c.url).pathname.endsWith(expected) ||
        (notification.scope === "client" &&
          new URL(c.url).pathname === new URL(SCOPE).pathname)),
  );
  for (const client of candidates) {
    const audible = await new Promise((resolve) => {
      const channel = new MessageChannel(),
        timer = setTimeout(() => finish(false), 900);
      function finish(value) {
        clearTimeout(timer);
        channel.port1.close();
        resolve(value);
      }
      channel.port1.onmessage = (e) => finish(e.data?.audible === true);
      try {
        client.postMessage({ type: "TOC_SERVICE_ALERT", notification }, [
          channel.port2,
        ]);
      } catch {
        finish(false);
      }
    });
    if (audible) return true;
  }
  return false;
}
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
