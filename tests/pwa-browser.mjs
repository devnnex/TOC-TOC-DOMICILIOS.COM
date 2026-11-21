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
const workerProtocol = await browser.newBrowserCDPSession();
let protocolSequence = 0;
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
  let registrationId,
    workerRunning = "";
  cdp.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
    for (const version of versions)
      if (version.scriptURL === base + "sw.js")
        workerRunning = version.runningStatus;
  });
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
    for (const r of registrations)
      if (r.scopeURL === base && !r.isDeleted)
        registrationId = r.registrationId;
  });
  await cdp.send("ServiceWorker.enable");
  const admin = await context.newPage();
  // A missed setup can be completed only by the authenticated owner.
  backend.tables.delete("PushSubscriptions");
  backend.tables.delete("PushEvents");
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
  const kpi = await admin.locator(".kpi-card").evaluateAll((nodes) =>
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
  async function wakeByPush() {
    await cdp.send("ServiceWorker.stopAllWorkers");
    await until(() => workerRunning === "stopped", "El worker no se detuvo.");
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: new URL(base).origin,
      registrationId,
      data: "",
    });
    await until(
      () => workerRunning === "running",
      "El aviso no despertó el worker.",
    );
    return true;
  }
  await wakeByPush();
  await assertNotification("Tienes servicios por aceptar");
  report.push(
    "El aviso del equipo despierta el worker detenido, con todas las páginas cerradas (entrada Push simulada por Chromium).",
  );
  await workerNotifications(true);
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
  await wakeByPush();
  await assertNotification("Tu domiciliario está en camino");
  report.push(
    "Aceptación entregada al cliente con la página cerrada y sin revelar dirección ni celular en el aviso.",
  );
  const second = {
    ...p,
    id: randomUUID(),
    trackingToken: createHash("sha256").update(randomUUID()).digest("hex"),
  };
  ok(backend.call("createRequest", second));
  const another = await context.newPage();
  await another.goto(base + "index.html");
  await another.evaluate(
    (p) => localStorage.setItem("toc-tracking", JSON.stringify(p)),
    second,
  );
  await another.reload();
  await another.locator("#tracking-dialog[open]").waitFor();
  await another.locator("[data-enable-push]").click();
  await until(
    () =>
      backend.context
        .rows_("PushSubscriptions")
        .filter((s) => s.scope === "client").length === 2,
    "No se conservaron las dos solicitudes.",
  );
  await another.bringToFront();
  await another.evaluate(async () => {
    const { sound } = await import("./assets/core.js?v=1.3.3");
    await sound.enable();
    await sound.context.suspend();
    window.resumeAudio = sound.context.resume.bind(sound.context);
    sound.context.resume = () => Promise.resolve();
  });
  const secondAccepted = ok(
    backend.call(
      "transition",
      {
        id: second.id,
        revision: 1,
        status: "accepted",
        courier: "Mensajero de prueba",
        courierPhone: "3101234567",
        fee: 6000,
      },
      backend.owner,
    ),
  );
  ok(backend.call("dispatchPush", secondAccepted.pushDispatch));
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(base).origin,
    registrationId,
    data: "",
  });
  await until(async () => {
    const n = (await workerNotifications()).find(
      (n) =>
        n.url?.endsWith("#service=" + second.id) &&
        n.title === "Tu domiciliario está en camino",
    );
    return n && n.silent === false && n.renotify === true;
  }, "La página con audio suspendido silenció el aviso.");
  await another.close();
  const completed = ok(
    backend.call(
      "transition",
      { id: p.id, revision: 2, status: "completed" },
      backend.owner,
    ),
  );
  ok(backend.call("dispatchPush", completed.pushDispatch));
  // A visible page for the other role must never suppress the client's sound.
  const unrelated = await context.newPage();
  await unrelated.goto(base + "admin.html");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(base).origin,
    registrationId,
    data: "",
  });
  await assertNotification("Un pendiente menos");
  const completedNotice = (await workerNotifications()).find(
    (n) => n.title === "Un pendiente menos",
  );
  assert.equal(completedNotice.renotify, true);
  assert.ok(completedNotice.url.endsWith("#service=" + p.id));
  await unrelated.close();
  const previous = await context.newPage();
  await previous.goto(base + "index.html#service=" + p.id);
  await previous
    .locator("#tracking-title")
    .filter({ hasText: "Pedido exitosamente realizado." })
    .waitFor();
  await previous.close();
  report.push(
    "Dos solicitudes del mismo dispositivo: finalizar la anterior vuelve a avisar y abre su seguimiento correcto, sin silenciar por otra página visible.",
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
  await offline.close();
  // A gesture requests permission, but never grants it on the person's behalf.
  const permissions = await browser.newContext({
    permissions: ["notifications"],
  });
  permissions.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  await permissions.addInitScript(() => {
    let permission = "default",
      subscription = null;
    window.promptCalls = [];
    Object.defineProperty(Notification, "permission", {
      get: () => permission,
      configurable: true,
    });
    Notification.requestPermission = () => {
      window.promptCalls.push({ active: navigator.userActivation.isActive });
      permission = window.permissionResponse || "granted";
      return Promise.resolve(permission);
    };
    PushManager.prototype.getSubscription = async () => subscription;
    PushManager.prototype.subscribe = async () =>
      (subscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/auto-qa",
      });
  });
  try {
    const automatic = await permissions.newPage();
    await automatic.goto(base + "index.html");
    await automatic
      .locator("[data-permission-intro]")
      .filter({ hasText: "Acepta los avisos" })
      .waitFor();
    await automatic.mouse.move(100, 100);
    await automatic.mouse.wheel(0, 100);
    await automatic.evaluate(() =>
      document.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    assert.equal(await automatic.evaluate(() => promptCalls.length), 0);
    await automatic.locator(".launch-city").click();
    await until(
      async () => (await automatic.evaluate(() => promptCalls.length)) === 1,
      "No se pidió permiso tras el clic.",
    );
    assert.equal(await automatic.evaluate(() => promptCalls[0].active), true);
    await automatic.locator(".launch-city").click();
    assert.equal(await automatic.evaluate(() => promptCalls.length), 1);
    await automatic.close();
    const dismissed = await permissions.newPage();
    await dismissed.goto(base + "index.html");
    await dismissed
      .locator("[data-permission-intro]")
      .filter({ hasText: "Acepta los avisos" })
      .waitFor();
    await dismissed.evaluate(() => (window.permissionResponse = "default"));
    await dismissed.keyboard.press("Enter");
    await until(
      async () => (await dismissed.evaluate(() => promptCalls.length)) === 1,
      "No se pidió permiso tras el teclado.",
    );
    await dismissed.locator(".launch-city").click();
    assert.equal(await dismissed.evaluate(() => promptCalls.length), 1);
    await dismissed.close();
    const denied = await permissions.newPage();
    await denied.goto(base + "index.html");
    await denied
      .locator("[data-permission-intro]")
      .filter({ hasText: "Acepta los avisos" })
      .waitFor();
    await denied.evaluate(() => (window.permissionResponse = "denied"));
    await denied.locator(".launch-city").click();
    await until(
      async () =>
        (await denied.evaluate(() => Notification.permission)) === "denied",
      "Falta la denegación.",
    );
    await denied.locator(".launch-city").click();
    assert.equal(await denied.evaluate(() => promptCalls.length), 1);
    await denied.close();
    report.push(
      "Permiso solicitado una vez tras clic o teclado; hover, scroll y eventos sintéticos no lo activan. Se respetan rechazo y cierre del aviso.",
    );
  } finally {
    await permissions.close();
  }
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
async function assertNotification(title) {
  let last = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    const list = (last = await workerNotifications());
    const found = list.find((n) => n.title === title);
    if (found) {
      assert.equal(found.silent, false);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "No llegó la notificación: " +
      title +
      "; visibles: " +
      JSON.stringify(last),
  );
}
async function workerNotifications(close = false) {
  const { targetInfos } = await workerProtocol.send("Target.getTargets");
  const target = targetInfos
    .filter((t) => t.type === "service_worker" && t.url === base + "sw.js")
    .at(-1);
  if (!target) return [];
  const { sessionId } = await workerProtocol.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  const id = ++protocolSequence;
  try {
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        workerProtocol.off("Target.receivedMessageFromTarget", receive);
        reject(new Error("No se pudo leer el worker."));
      }, 5000);
      function receive(event) {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        if (message.id !== id) return;
        clearTimeout(timeout);
        workerProtocol.off("Target.receivedMessageFromTarget", receive);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
      workerProtocol.on("Target.receivedMessageFromTarget", receive);
    });
    const expression = close
      ? "(async()=>{for(const n of await self.registration.getNotifications())n.close();return []})()"
      : "(async()=> (await self.registration.getNotifications()).map(n=>({title:n.title,body:n.body,silent:n.silent,renotify:n.renotify,url:n.data?.url})))()";
    await workerProtocol.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    });
    const reply = await result;
    if (reply.exceptionDetails)
      throw new Error("No se pudo consultar los avisos del worker.");
    return reply.result.value;
  } finally {
    await workerProtocol
      .send("Target.detachFromTarget", { sessionId })
      .catch(() => {});
  }
}
async function until(predicate, message) {
  for (let i = 0; i < 80; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
