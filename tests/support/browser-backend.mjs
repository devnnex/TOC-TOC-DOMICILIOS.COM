import fs from "node:fs";
import { environment } from "./gas.mjs";
import { stubMapFrames } from "./map-frames.mjs";

// Prueba la interfaz de producción contra el Code.gs real, sin tocar el Sheet.
export async function browserBackend(browser, errors) {
  const server = environment({ createOwner: false });
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 900 },
    locale: "es-CO",
    permissions: ["geolocation"],
    geolocation: { latitude: 7.0653, longitude: -73.8547, accuracy: 124 },
  });
  const endpoint = "https://script.google.com/macros/s/mock/exec";
  await stubMapFrames(context);
  await context.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: fs
        .readFileSync("config.js", "utf8")
        .replace(/apiUrl:\s*"[^"]*"/, `apiUrl: "${endpoint}"`),
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
  // Primera apertura: el alta aparece sin buscar ni pulsar un enlace manual.
  await admin.locator("#setup-fields").waitFor();
  if (
    !(await admin.locator("#login-submit").textContent()).includes(
      "Crear mi cuenta",
    )
  )
    throw new Error("El primer acceso debe exigir crear al jefe.");
  await admin.screenshot({
    path: "test-results/first-owner-setup.png",
    fullPage: true,
  });
  await admin.locator('#login-form [name="name"]').fill("Jefe de prueba");
  await admin.locator('#login-form [name="email"]').fill("jefe@example.com");
  await admin
    .locator('#login-form [name="password"]')
    .fill("UnaClaveSegura2026!");
  await admin
    .locator('#login-form [name="passwordConfirmation"]')
    .fill("ContraseñaDistinta2026!");
  await admin
    .locator('#login-form [name="bootstrapToken"]')
    .fill("codigo-invalido");
  await admin.locator("#login-submit").click();
  await admin
    .locator("#login-error")
    .filter({ hasText: "no coinciden" })
    .waitFor();
  if (server.context.rows_("Users").length)
    throw new Error("No debe crearse una cuenta con contraseñas distintas.");
  await admin
    .locator('#login-form [name="passwordConfirmation"]')
    .fill("UnaClaveSegura2026!");
  await admin.locator("#login-submit").click();
  await admin
    .locator("#login-error")
    .filter({ hasText: "Código de instalación incorrecto" })
    .waitFor();
  if (server.context.rows_("Users").length)
    throw new Error("No debe crearse una cuenta sin un código válido.");
  await admin
    .locator('#login-form [name="bootstrapToken"]')
    .fill(server.props.get("BOOTSTRAP_TOKEN"));
  await admin.locator("#login-submit").click();
  await admin.locator("#requests-list .empty-state").waitFor();
  if (server.context.rows_("Users").length !== 1)
    throw new Error("Debe crearse exactamente un jefe.");
  await admin.locator("#logout-button").click();
  await admin.locator("#login-form").waitFor();
  await admin.locator("#setup-fields").waitFor({ state: "hidden" });
  if (
    (await admin.locator("#login-submit").textContent()).trim() !==
    "Entrar al panel"
  )
    throw new Error("Con un jefe registrado debe mostrarse el ingreso normal.");
  await admin.locator("#login-form [name=email]").fill("jefe@example.com");
  await admin
    .locator("#login-form [name=password]")
    .fill("UnaClaveSegura2026!");
  await admin.locator("#login-submit").click();
  await admin.locator("#requests-list .empty-state").waitFor();
  const client = await context.newPage();
  watch(client);
  await client.goto("http://127.0.0.1:4173/index.html");
  await client.locator("#request-launch").click();
  await client
    .locator("#detected-address")
    .filter({ hasText: "Calle 49" })
    .waitFor();
  await client
    .locator("#location-status")
    .filter({ hasText: "GPS ±124 m" })
    .waitFor();
  await client.locator("[name=name]").fill("Prueba backend navegador");
  await client.locator("[name=phone]").fill("3001234567");
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
  const saved = server.context.rows_("Requests")[0];
  if (
    saved.lat !== 7.0653 ||
    saved.lng !== -73.8547 ||
    !saved.address.includes("Calle 49")
  )
    throw new Error(
      "El servicio debe conservar el GPS original y la dirección resuelta por Google.",
    );
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
  // Una implementación anterior debe mostrar cómo actualizar, sin fingir detección.
  const oldDeployment = await context.newPage();
  watch(oldDeployment);
  await oldDeployment.route(endpoint, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Inicia sesión para continuar.",
        },
      }),
    }),
  );
  await oldDeployment.goto("http://127.0.0.1:4173/admin.html");
  await oldDeployment
    .locator("#access-title")
    .filter({ hasText: "Actualiza la conexión" })
    .waitFor();
  await oldDeployment.locator("#login-form").waitFor({ state: "hidden" });
  await context.close();
}
