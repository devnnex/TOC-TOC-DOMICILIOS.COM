const { chromium } = await import(
  process.env.TOC_PLAYWRIGHT_MODULE || "playwright"
);
import fs from "node:fs";
import { browserBackend } from "./support/browser-backend.mjs";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.TOC_BROWSER_EXECUTABLE
      ? { executablePath: process.env.TOC_BROWSER_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    locale: "es-CO",
    permissions: ["geolocation"],
    geolocation: { latitude: 7.065, longitude: -73.854, accuracy: 20 },
  });
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
  };
  const admin = await context.newPage();
  watch(admin);
  await admin.goto("http://127.0.0.1:4173/admin.html?demo=1");
  await admin.locator("#requests-list .request-item").first().waitFor();
  fs.mkdirSync("test-results", { recursive: true });
  await admin.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
  await admin.locator("#sound-button").click();
  await admin.locator("#sound-button.enabled").waitFor();
  const client = await context.newPage();
  watch(client);
  await client.goto("http://127.0.0.1:4173/index.html?demo=1");
  await client.screenshot({
    path: "test-results/client-desktop.png",
    fullPage: true,
  });
  await client.locator("[name=name]").fill("Camila QA");
  await client.locator("[name=phone]").fill("3001234567");
  await client.locator("#address").fill("Calle 49 # 8-25");
  await client.locator("[name=reference]").fill("Casa de puerta azul");
  await client.locator("[name=notes]").fill("Prueba de interfaz");
  await client.locator("[name=consent]").check();
  await client.locator("#submit-request").click();
  await client.locator("#tracking-dialog[open]").waitFor();
  await client
    .locator("#tracking-title")
    .filter({ hasText: "Tu solicitud ya está" })
    .waitFor();
  await admin.bringToFront();
  await admin.locator("#refresh-button").click();
  const card = admin.locator(".request-item").filter({ hasText: "Camila QA" });
  await card.waitFor();
  const details = card.locator("details").first();
  if (
    !(await details.getAttribute("open")) &&
    (await details.getAttribute("open")) !== ""
  )
    await card.locator(".request-summary").click();
  await card
    .getByRole("button", { name: "Aceptar y enviar domiciliario" })
    .click();
  await admin.locator("[name=courier]").fill("Nicolás QA");
  await admin.locator("[name=courierPhone]").fill("3101234567");
  await admin.locator("[name=fee]").fill("6500");
  await admin.locator("#action-submit").click();
  await admin.locator("#action-dialog").waitFor({ state: "hidden" });
  await client.bringToFront();
  await client
    .locator("#tracking-title")
    .filter({ hasText: "Tu domiciliario está en camino" })
    .waitFor({ timeout: 15000 });
  await client.screenshot({
    path: "test-results/client-accepted.png",
    fullPage: true,
  });
  await client.reload();
  await client
    .locator("#tracking-title")
    .filter({ hasText: "Tu domiciliario está en camino" })
    .waitFor({ timeout: 15000 });
  await admin.bringToFront();
  await admin.locator("[data-filter=accepted]").click();
  const accepted = admin
    .locator(".request-item")
    .filter({ hasText: "Camila QA" });
  await accepted.waitFor();
  const accDetails = accepted.locator("details").first();
  if ((await accDetails.getAttribute("open")) === null)
    await accepted.locator(".request-summary").click();
  await accepted.getByRole("button", { name: "Marcar completado" }).click();
  await admin.locator("#action-submit").click();
  await admin.locator("#action-dialog").waitFor({ state: "hidden" });
  await client.bringToFront();
  await client
    .locator("#tracking-title")
    .filter({ hasText: "Un pendiente menos" })
    .waitFor({ timeout: 15000 });
  await admin.bringToFront();
  await admin.locator("[data-view=analytics]").click();
  await admin.locator("#analytics-kpis .kpi-card").first().waitFor();
  await admin.screenshot({
    path: "test-results/analytics-desktop.png",
    fullPage: true,
  });
  await admin.locator("[data-view=history]").click();
  await admin.locator("#history-table tr").first().waitFor();
  await admin.locator("[data-view=team]").click();
  await admin.locator("#team-form [name=name]").fill("Operador QA");
  await admin.locator("#team-form [name=email]").fill("qa@example.com");
  await admin.locator("#team-form [name=password]").fill("PruebaSegura2026!");
  await admin.locator("#team-submit").click();
  await admin
    .locator(".team-person")
    .filter({ hasText: "Operador QA" })
    .waitFor();
  await admin
    .locator(".team-person")
    .filter({ hasText: "Operador QA" })
    .getByRole("button", { name: "Restablecer contraseña" })
    .click();
  await admin
    .locator("#reset-form [name=password]")
    .fill("OtraPruebaSegura2026!");
  await admin.locator("#reset-submit").click();
  await admin.locator("#reset-dialog").waitFor({ state: "hidden" });
  await admin.locator("[data-view=inbox]").click();
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.screenshot({
    path: "test-results/admin-mobile.png",
    fullPage: true,
  });
  if (
    await admin.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )
  )
    throw Error("Desborde horizontal en admin móvil");
  await client.locator("#new-request").click();
  await client.setViewportSize({ width: 390, height: 844 });
  await client.screenshot({
    path: "test-results/client-mobile.png",
    fullPage: true,
  });
  if (
    await client.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )
  )
    throw Error("Desborde horizontal en cliente móvil");
  await client.locator("#locate-button").click();
  await client
    .locator("#location-status")
    .filter({ hasText: "Ubicación encontrada" })
    .waitFor();
  // La interfaz de producción debe informar que no está conectada, sin enviar un éxito ficticio.
  const prod = await context.newPage();
  watch(prod);
  await prod.goto("http://127.0.0.1:4173/index.html");
  await prod
    .locator("#environment-banner")
    .filter({ hasText: "Conexión pendiente" })
    .waitFor();
  await browserBackend(browser, errors);
  const report = {
    pass: true,
    errors,
    checks: [
      "Landing desktop y móvil",
      "Panel desktop y móvil sin desborde",
      "Solicitud desde cliente",
      "Sincronización entre pestañas",
      "Asignación y aceptación",
      "Seguimiento recuperado al recargar",
      "Finalización y tarifa",
      "Estadísticas e historial",
      "Crear y restablecer administrador",
      "GPS autorizado simulado",
      "AudioContext habilitado",
      "Producción informa conexión pendiente",
      "Login real y API contra Code.gs en memoria",
      "Solicitud y aceptación contra el backend completo",
      "Administrador con cambio inicial obligatorio y permisos",
    ],
  };
  fs.writeFileSync(
    "test-results/browser-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
