import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
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
const context = await browser.newContext({ locale: "es-CO" }),
  errors = [];
context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
await context.addInitScript(() => {
  Object.defineProperty(Notification, "permission", {
    get: () => "denied",
    configurable: true,
  });
  window.audioEvents = [];
  window.oscillatorStarts = 0;
  window.spoken = [];
  window.addEventListener("toc:audio-played", (e) =>
    audioEvents.push(e.detail.key),
  );
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...args) {
    oscillatorStarts++;
    return start.apply(this, args);
  };
  const resume = AudioContext.prototype.resume;
  AudioContext.prototype.resume = function () {
    return window.blockAudio ? Promise.resolve() : resume.call(this);
  };
  speechSynthesis.speak = (u) => {
    if (u.text) spoken.push(u.text);
  };
});
const ok = (r) => {
  assert.equal(r.ok, true, r.error?.message);
  return r.data;
};
function order() {
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
  ok(backend.call("createRequest", p));
  return p;
}
async function refresh(page) {
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("toc:service-update")),
  );
}
async function heard(page, key) {
  await page.waitForFunction((key) => audioEvents.includes(key), key);
  assert.ok(await page.evaluate(() => oscillatorStarts >= 4));
}
try {
  const admin = await context.newPage();
  await admin.goto(base + "admin.html");
  await admin.locator("#login-form [name=email]").fill("jefe@example.com");
  await admin
    .locator("#login-form [name=password]")
    .fill("UnaClaveSegura2026!");
  await admin.locator("#login-submit").click();
  await admin.locator("#requests-list .empty-state").waitFor();
  const first = order();
  await refresh(admin);
  await heard(admin, "admin:" + first.id + ":new");
  await refresh(admin);
  assert.equal(
    await admin.evaluate(
      (key) => audioEvents.filter((k) => k === key).length,
      "admin:" + first.id + ":new",
    ),
    1,
  );
  await admin.evaluate(async () => {
    window.blockAudio = true;
    const { sound } = await import("./assets/core.js?v=1.3.5");
    await sound.context.suspend();
  });
  const second = order();
  await refresh(admin);
  await admin.locator("#requests-list .request-item").nth(1).waitFor();
  await admin.waitForFunction(async () => {
    const { sound } = await import("./assets/core.js?v=1.3.5");
    return sound.pending > 0;
  });
  assert.equal(
    await admin.evaluate(
      (key) => audioEvents.includes(key),
      "admin:" + second.id + ":new",
    ),
    false,
  );
  await admin.evaluate(() => (window.blockAudio = false));
  await admin.locator("#today-label").click();
  await heard(admin, "admin:" + second.id + ":new");
  const client = await context.newPage();
  await client.goto(base + "index.html");
  await client.evaluate(
    (p) => localStorage.setItem("toc-tracking", JSON.stringify(p)),
    first,
  );
  await client.reload();
  await client.locator("#tracking-dialog[open]").waitFor();
  await client.locator("#tracking-sound").click();
  ok(
    backend.call(
      "transition",
      {
        id: first.id,
        revision: 1,
        status: "accepted",
        courier: "Mensajero de prueba",
        courierPhone: "3101234567",
        fee: 6000,
      },
      backend.owner,
    ),
  );
  await refresh(client);
  await heard(client, "client:" + first.id + ":accepted");
  await client.evaluate(async () => {
    window.blockAudio = true;
    const { sound } = await import("./assets/core.js?v=1.3.5");
    await sound.context.suspend();
  });
  ok(
    backend.call(
      "transition",
      { id: first.id, revision: 2, status: "completed" },
      backend.owner,
    ),
  );
  await refresh(client);
  await client
    .locator("#tracking-title")
    .filter({ hasText: "Pedido exitosamente realizado." })
    .waitFor();
  assert.equal(
    await client.evaluate(
      (key) => audioEvents.includes(key),
      "client:" + first.id + ":completed",
    ),
    false,
  );
  await client.reload();
  await client
    .locator("#tracking-title")
    .filter({ hasText: "Pedido exitosamente realizado." })
    .waitFor();
  await client.locator("#tracking-title").click();
  await heard(client, "client:" + first.id + ":completed");
  await client.waitForFunction(() =>
    spoken.some((s) => s.includes("fue completado")),
  );
  assert.equal(
    await client.evaluate(
      (key) => audioEvents.filter((k) => k === key).length,
      "client:" + first.id + ":completed",
    ),
    1,
  );
  assert.deepEqual(errors, []);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/audio-report.json",
    JSON.stringify(
      {
        pass: true,
        checks: [
          "Nueva solicitud: osciladores reales y voz",
          "Sin duplicar el sondeo",
          "Audio suspendido: cola pendiente y recuperación tras clic",
          "Aceptación con sonido",
          "Finalización con audio suspendido: se recupera incluso detenido el sondeo",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Sonido, voz, cola pendiente y recuperación del audio: correctos.",
  );
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
