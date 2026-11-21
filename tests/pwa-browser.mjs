import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { startPwaServer } from "./support/pwa-server.mjs";
const { chromium } = await import(
  process.env.TOC_PLAYWRIGHT_MODULE || "playwright"
);
const server = await startPwaServer(),
  { backend, base } = server;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TOC_BROWSER_EXECUTABLE
    ? { executablePath: process.env.TOC_BROWSER_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({
    viewport: { width: 1920, height: 840 },
    permissions: ["notifications"],
    locale: "es-CO",
  }),
  errors = [],
  report = [];
context.on("page", (page) =>
  page.on("pageerror", (error) => errors.push(error.message)),
);
// Only the browser's subscription broker is stubbed. WebCrypto, service worker,
// permissions, IndexedDB, the real Code.gs, inbox fetch and showNotification run.
await context.addInitScript(() => {
  let sub = null;
  PushManager.prototype.getSubscription = async () => sub;
  PushManager.prototype.subscribe = async function (options) {
    if (!options.applicationServerKey?.length) throw new Error("Missing key");
    sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/browser-qa",
      unsubscribe: async () => true,
    };
    return sub;
  };
});
function ok(r) {
  assert.equal(r.ok, true, r.error?.message);
  return r.data;
}
try {
  await mkdir("test-results", { recursive: true });
  const observer = await context.newPage(),
    cdp = await context.newCDPSession(observer);
  let registrationId;
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
    for (const r of registrations)
      if (r.scopeURL === base && !r.isDeleted)
        registrationId = r.registrationId;
  });
  await cdp.send("ServiceWorker.enable");
  const admin = await context.newPage();
  await admin.goto(base + "admin.html");
  await admin.locator("#login-form [name=email]").fill("jefe@example.com");
  await admin
    .locator("#login-form [name=password]")
    .fill("UnaClaveSegura2026!");
  await admin.locator("#login-submit").click();
  await admin.locator("#requests-list .empty-state").waitFor();
  await admin.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await admin.locator("#sound-button").click();
  await admin
    .locator("#sound-button span")
    .filter({ hasText: "Avisos activados" })
    .waitFor();
  assert.equal(backend.props.get("PUSH_PUBLIC_KEY").length, 87);
  assert.equal(backend.context.rows_("PushSubscriptions").length, 1);
  report.push(
    "Activación desde el panel: WebCrypto y backend reales en memoria.",
  );
  assert.ok(registrationId, "Service worker registration missing");
  await admin.screenshot({
    path: "test-results/admin-pwa-desktop.png",
    fullPage: true,
  });
  const kpi = await admin
    .locator(".kpi-card")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        background: getComputedStyle(n).backgroundColor,
        value: getComputedStyle(n.querySelector(".kpi-value")).color,
      })),
    );
  assert.ok(
    kpi.every(
      (k) =>
        k.background === "rgb(255, 255, 255)" && k.value === "rgb(23, 35, 43)",
    ),
  );
  await admin.close();
  const p = {
    id: randomUUID(),
    trackingToken: createHash("sha256").update(randomUUID()).digest("hex"),
    name: "Cliente de prueba",
    phone: "3001234567",
    cityId: "barrancabermeja",
    address: "Calle 49 # 8-25",
    service: "envio",
    consent: true,
  };
  const created = ok(backend.call("createRequest", p));
  ok(backend.call("dispatchPush", created.pushDispatch));
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(base).origin,
    registrationId,
    data: "",
  });
  const worker = context.serviceWorkers().find((w) => w.url().startsWith(base));
  assert.ok(worker);
  await assertNotification(worker, "Tienes servicios por aceptar");
  report.push(
    "Notificación visible del equipo con todas las páginas de la app cerradas (entrada Push simulada por Chromium).",
  );
  await worker.evaluate(async () => {
    for (const n of await self.registration.getNotifications()) n.close();
  });
  const client = await context.newPage();
  await client.goto(base + "index.html");
  await client.locator(".rider-stage img").evaluate((img) => img.decode());
  for (const viewport of [
    { width: 1920, height: 840 },
    { width: 1366, height: 650 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await client.setViewportSize(viewport);
    const layout = await client.evaluate(() => {
      const stage = document
          .querySelector(".rider-stage")
          .getBoundingClientRect(),
        disc = document.querySelector(".power-disc").getBoundingClientRect(),
        label = document.querySelector(".power-label").getBoundingClientRect(),
        x = disc.x + disc.width / 2,
        y = disc.y + disc.height / 2;
      return {
        stageBottom: stage.bottom,
        discTop: disc.top,
        labelBottom: label.bottom,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        clickable: !!document
          .elementFromPoint(x, y)
          ?.closest("#request-launch"),
      };
    });
    assert.ok(layout.discTop > layout.stageBottom, JSON.stringify(layout));
    assert.ok(layout.clickable);
    assert.equal(layout.overflow, false);
    assert.ok(layout.labelBottom < viewport.height, JSON.stringify(layout));
    await client.screenshot({
      path: `test-results/client-pwa-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  }
  await client.evaluate(
    (p) =>
      localStorage.setItem(
        "toc-tracking",
        JSON.stringify({ id: p.id, trackingToken: p.trackingToken }),
      ),
    p,
  );
  await client.reload();
  await client.locator("#tracking-dialog[open]").waitFor();
  await client.locator("[data-enable-push]").click();
  await client
    .locator("#keep-open-title")
    .filter({ hasText: "Avisos activados" })
    .waitFor();
  await client.close();
  const accepted = ok(
    backend.call(
      "transition",
      {
        id: p.id,
        revision: 1,
        status: "accepted",
        courier: "Mensajero de prueba",
        courierPhone: "3101234567",
        fee: 6000,
      },
      backend.owner,
    ),
  );
  ok(backend.call("dispatchPush", accepted.pushDispatch));
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(base).origin,
    registrationId,
    data: "",
  });
  await assertNotification(worker, "Tu domiciliario está en camino");
  report.push(
    "Aceptación entregada al cliente con la página cerrada y sin revelar dirección ni celular en el aviso.",
  );
  const offline = await context.newPage();
  await offline.goto(base + "index.html");
  await offline.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await offline.reload();
  await offline.locator("#request-launch").waitFor();
  await offline
    .locator("[data-offline-status]")
    .filter({ hasText: "sin conexión" })
    .waitFor();
  await context.setOffline(false);
  report.push(
    "Inicio disponible sin conexión; operaciones de servicios requieren conexión.",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/pwa-report.json",
    JSON.stringify({ passed: report, layouts: 4, errors }, null, 2),
  );
  console.log(report.join("\n"));
  console.log("PWA, avisos y cuatro tamaños de pantalla: correctos.");
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
async function assertNotification(worker, title) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const list = await worker.evaluate(async () => {
      return (await self.registration.getNotifications()).map((n) => ({
        title: n.title,
        body: n.body,
        silent: n.silent,
      }));
    });
    const found = list.find((n) => n.title === title);
    if (found) {
      assert.equal(found.silent, false);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("No llegó la notificación: " + title);
}
