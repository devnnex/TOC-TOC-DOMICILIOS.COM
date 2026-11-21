import fs from "node:fs";
import { environment } from "./gas.mjs";

// Prueba la interfaz de producción contra el Code.gs real, sin tocar el Sheet.
export async function browserBackend(browser, errors) {
  const server = environment();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "es-CO",
  });
  const endpoint = "https://script.google.com/macros/s/mock/exec";
  await context.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: fs
        .readFileSync("config.js", "utf8")
        .replace(/apiUrl:\s*["']{2}/, `apiUrl: "${endpoint}"`),
    }),
  );
  await context.route(endpoint, (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(server.call(body.action, body.data, body.session)),
    });
  });
  const watch = (page) => page.on("pageerror", (e) => errors.push(e.message));
  const admin = await context.newPage();
  watch(admin);
  await admin.goto("http://127.0.0.1:4173/admin.html");
  await admin.locator("#login-form [name=email]").fill("jefe@example.com");
  await admin
    .locator("#login-form [name=password]")
    .fill("UnaClaveSegura2026!");
  await admin.locator("#login-submit").click();
  await admin.locator("#requests-list .empty-state").waitFor();
  const client = await context.newPage();
  watch(client);
  await client.goto("http://127.0.0.1:4173/index.html");
  await client.locator("[name=name]").fill("Prueba backend navegador");
  await client.locator("[name=phone]").fill("3001234567");
  await client.locator("#address").fill("Calle 49 # 8-25");
  await client.locator("[name=consent]").check();
  await client.locator("#submit-request").click();
  await client
    .locator("#tracking-title")
    .filter({ hasText: "Tu solicitud ya está" })
    .waitFor();
  await admin.bringToFront();
  await admin.locator("#refresh-button").click();
  const card = admin
    .locator(".request-item")
    .filter({ hasText: "Prueba backend navegador" });
  await card.waitFor();
  await card
    .getByRole("button", { name: "Aceptar y enviar domiciliario" })
    .click();
  await admin.locator("[name=courier]").fill("Operador de prueba");
  await admin.locator("[name=courierPhone]").fill("3101234567");
  await admin.locator("[name=fee]").fill("8000");
  await admin.locator("#action-submit").click();
  await admin.locator("#action-dialog").waitFor({ state: "hidden" });
  await client.bringToFront();
  await client
    .locator("#tracking-title")
    .filter({ hasText: "Tu domiciliario está en camino" })
    .waitFor({ timeout: 15000 });
  // Crear un administrador y entrar con su contraseña inicial desde otra sesión.
  await admin.bringToFront();
  await admin.locator("[data-view=team]").click();
  await admin.locator("#team-form [name=name]").fill("Administrador integrado");
  await admin.locator("#team-form [name=email]").fill("integrado@example.com");
  await admin
    .locator("#team-form [name=password]")
    .fill("AdministradorSeguro2026!");
  await admin.locator("#team-submit").click();
  await admin
    .locator(".team-person")
    .filter({ hasText: "Administrador integrado" })
    .waitFor();
  // sessionStorage se conserva por pestaña; esta empieza sin sesión.
  const operator = await context.newPage();
  watch(operator);
  await operator.goto("http://127.0.0.1:4173/admin.html");
  await operator
    .locator("#login-form [name=email]")
    .fill("integrado@example.com");
  await operator
    .locator("#login-form [name=password]")
    .fill("AdministradorSeguro2026!");
  await operator.locator("#login-submit").click();
  await operator
    .locator("#password-notice")
    .filter({ hasText: "Antes de operar" })
    .waitFor();
  await operator
    .locator("#password-form [name=currentPassword]")
    .fill("AdministradorSeguro2026!");
  await operator
    .locator("#password-form [name=newPassword]")
    .fill("AdministradorNuevo2026!");
  await operator.locator("#password-submit").click();
  await operator
    .locator("#password-notice")
    .filter({ hasText: "Ya puedes operar" })
    .waitFor();
  await operator.locator("[data-view=inbox]").click();
  await operator.locator("#requests-list .empty-state").waitFor(); // Ninguno por aceptar: ya se aceptó.
  if (await operator.locator("#team-nav").isVisible())
    throw new Error("El administrador no debe ver gestión de equipo.");
  await context.close();
}
