import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { environment } from "./support/gas.mjs";
test("la instalación exige crear el primer jefe y solo publica un estado sin credenciales", () => {
  const e = environment({ createOwner: false });
  const bootstrapToken = e.props.get("BOOTSTRAP_TOKEN");
  const status = e.call("installationStatus");
  assert.equal(status.data.state, "needs_owner");
  assert.equal(status.data.bootstrapAvailable, true);
  assert.equal(JSON.stringify(status).includes(bootstrapToken), false);
  assert.equal(
    e.call("login", { email: "jefe@example.com", passwordKey: e.ownerKey })
      .error.code,
    "OWNER_REQUIRED",
  );
  assert.equal(
    e.call("bootstrap", {
      email: "jefe@example.com",
      passwordKey: e.ownerKey,
      name: "Jefe",
      bootstrapToken: "incorrecto",
    }).error.code,
    "FORBIDDEN",
  );
  assert.equal(e.context.rows_("Users").length, 0);
  const created = e.call("bootstrap", {
    email: "jefe@example.com",
    passwordKey: e.ownerKey,
    name: "Jefe",
    bootstrapToken,
  });
  assert.ok(created.ok);
  const ready = e.call("installationStatus");
  assert.equal(ready.data.state, "ready");
  assert.equal(ready.data.bootstrapAvailable, false);
  assert.equal(JSON.stringify(ready).includes("jefe@example.com"), false);
  assert.equal(
    e.call("bootstrap", { bootstrapToken }).error.code,
    "OWNER_ALREADY_EXISTS",
  );
  assert.equal(e.context.rows_("Users").length, 1);
});
test("el estado de instalación identifica setup pendiente y el código inicial faltante", () => {
  const e = environment({ createOwner: false });
  e.props.delete("BOOTSTRAP_TOKEN");
  assert.equal(e.call("installationStatus").data.bootstrapAvailable, false);
  e.context.setup();
  assert.equal(e.call("installationStatus").data.bootstrapAvailable, true);
  e.props.delete("PEPPER");
  assert.equal(e.call("installationStatus").data.state, "needs_setup");
});
test("el login agenda mantenimiento una sola vez sin esperar la limpieza", () => {
  const e = environment();
  e.call("login", { email: "jefe@example.com", passwordKey: e.ownerKey });
  e.call("login", { email: "jefe@example.com", passwordKey: e.ownerKey });
  assert.equal(
    e.triggers.filter((t) => t.getHandlerFunction() === "maintenanceAfterLogin")
      .length,
    1,
  );
  e.context.maintenanceAfterLogin();
  assert.equal(e.triggers.length, 1);
  assert.ok(e.context.system_("maintenanceAt"));
});
test("un cliente que sigue esperando recibe la expiración sin esperar al ciclo diario", () => {
  const e = environment(),
    p = payload();
  e.call("createRequest", p);
  const o = e.context.rows_("Requests")[0];
  o.createdAt = new Date(Date.now() - 61 * 60000).toISOString();
  e.context.write_("Requests", o);
  assert.equal(e.call("trackRequest", p).data.status, "cancelled");
  assert.equal(e.call("trackRequest", p).data.status, "cancelled");
  assert.equal(e.call("stats", { days: 7 }, e.owner).data.totals.cancelled, 1);
});
function payload(overrides = {}) {
  return {
    id: randomUUID(),
    trackingToken: createHash("sha256").update(randomUUID()).digest("hex"),
    name: "Cliente de prueba",
    phone: "3001234567",
    cityId: "barrancabermeja",
    address: "Calle 49 # 8-25",
    reference: "Puerta verde",
    service: "envio",
    notes: "Sobre cerrado",
    consent: true,
    ...overrides,
  };
}
test("setup es idempotente y el bootstrap solo puede usarse una vez", () => {
  const e = environment();
  e.context.setup();
  assert.equal(e.triggers.length, 1);
  assert.equal(e.tables.get("Users").getLastRow(), 2);
  assert.equal(e.props.has("BOOTSTRAP_TOKEN"), false);
  assert.equal(
    e.call("bootstrap", { bootstrapToken: "otro" }).error.code,
    "OWNER_ALREADY_EXISTS",
  );
});
test("solicitud, aceptación, seguimiento privado y estadísticas sin doble asignación", () => {
  const e = environment(),
    p = payload();
  const created = e.call("createRequest", p);
  assert.ok(created.ok);
  assert.equal(e.call("createRequest", p).data.id, created.data.id);
  assert.equal(e.tables.get("Requests").getLastRow(), 2);
  assert.equal(
    e.call("trackRequest", { id: p.id, trackingToken: "f".repeat(64) }).error
      .code,
    "NOT_FOUND",
  );
  const accepted = e.call(
    "transition",
    {
      id: p.id,
      revision: 1,
      status: "accepted",
      courier: "Juan",
      courierPhone: "3101234567",
      fee: 6000,
    },
    e.owner,
  );
  assert.ok(accepted.ok, accepted.error?.message);
  assert.equal(
    e.call("transition", { id: p.id, revision: 1, status: "accepted" }, e.owner)
      .error.code,
    "CONFLICT",
  );
  const track = e.call("trackRequest", p).data;
  assert.equal(track.status, "accepted");
  assert.equal(track.courier, "Juan");
  assert.equal(track.phone, undefined);
  assert.equal(track.trackingHash, undefined);
  assert.ok(
    e.call(
      "transition",
      { id: p.id, revision: 2, status: "completed" },
      e.owner,
    ).ok,
  );
  const t = e.call("stats", { days: 7 }, e.owner).data.totals;
  assert.equal(t.requested, 1);
  assert.equal(t.accepted, 1);
  assert.equal(t.completed, 1);
  assert.equal(t.revenue, 6000);
});
test("permisos por rol, cambio inicial y desactivación revocan acceso", () => {
  const e = environment(),
    key = e.key("admin@example.com");
  const u = e.call(
    "createUser",
    { email: "admin@example.com", name: "Operador", passwordKey: key },
    e.owner,
  );
  assert.ok(u.ok, u.error?.message);
  const login = e.call("login", {
    email: "admin@example.com",
    passwordKey: key,
  });
  assert.ok(login.ok);
  const s = login.data.token;
  assert.equal(
    e.call("dashboard", {}, s).error.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  const next = e.key("admin@example.com", "OtraClaveSegura2026!");
  assert.ok(e.call("changePassword", { currentKey: key, newKey: next }, s).ok);
  assert.equal(e.call("listUsers", {}, s).error.code, "FORBIDDEN");
  assert.equal(
    e.call("createUser", { role: "owner" }, s).error.code,
    "FORBIDDEN",
  );
  assert.ok(
    e.call("setUserActive", { id: u.data.id, active: false }, e.owner).ok,
  );
  assert.equal(e.call("dashboard", {}, s).error.code, "UNAUTHORIZED");
  assert.equal(
    e.call("login", { email: "admin@example.com", passwordKey: next }).error
      .code,
    "INVALID_CREDENTIALS",
  );
});
test("ciudad, GPS, datos malformados y cancelaciones se validan en el servidor", () => {
  const e = environment();
  assert.equal(
    e.call(
      "createRequest",
      payload({ lat: 4.7, lng: -74.1, locationMode: "gps" }),
    ).error.code,
    "OUTSIDE_CITY",
  );
  assert.equal(
    e.call("createRequest", payload({ phone: "123" })).error.code,
    "VALIDATION",
  );
  assert.equal(
    e.call("createRequest", payload({ consent: false })).error.code,
    "VALIDATION",
  );
  const p = payload({
    locationMode: "gps",
    lat: 7.065,
    lng: -73.854,
    accuracy: 15,
  });
  assert.ok(e.call("createRequest", p).ok);
  const gps = e.call("updateLocation", { ...p, lat: 7.066 });
  assert.ok(gps.ok);
  assert.ok(e.call("cancelRequest", p).ok);
  assert.equal(e.call("trackRequest", p).data.status, "cancelled");
  assert.equal(e.call("dashboard").error.code, "UNAUTHORIZED");
  const me = e.call("me", {}, e.owner);
  assert.equal(me.data.user.passwordHash, undefined);
});
test("sesión revocada, contraseña incorrecta y aislamiento de otra ciudad", () => {
  const e = environment();
  assert.equal(
    e.call("login", { email: "jefe@example.com", passwordKey: "a".repeat(64) })
      .error.code,
    "INVALID_CREDENTIALS",
  );
  const p = payload();
  e.call("createRequest", p);
  e.context.append_("Cities", {
    id: "otra",
    name: "Otra",
    lat: 7,
    lng: -73,
    radiusKm: 12,
    north: 8,
    south: 6,
    east: -72,
    west: -74,
    active: true,
  });
  const other = {
    id: "other-user",
    email: "other@example.com",
    name: "Otro jefe",
    role: "owner",
    cityId: "otra",
    passwordHash: "unused",
    active: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };
  e.context.append_("Users", other);
  e.cache.delete("users");
  const s = e.context.openSession_(other).token;
  assert.equal(e.call("dashboard", {}, s).data.orders.length, 0);
  assert.equal(
    e.call(
      "transition",
      { id: p.id, revision: 1, status: "cancelled", cancelReason: "X" },
      s,
    ).error.code,
    "NOT_FOUND",
  );
  assert.ok(e.call("logout", {}, e.owner).ok);
  assert.equal(e.call("me", {}, e.owner).error.code, "UNAUTHORIZED");
});
test("mantenimiento archiva y conserva solicitudes, auditoría y estadísticas antiguas", () => {
  const e = environment(),
    p = payload();
  e.call("createRequest", p);
  const row = e.context.rows_("Requests")[0];
  row.createdAt = new Date(Date.now() - 40 * 86400000).toISOString();
  row.status = "completed";
  row.acceptedAt = new Date(
    new Date(row.createdAt).getTime() + 60000,
  ).toISOString();
  row.completedAt = row.acceptedAt;
  row.fee = 7000;
  e.context.write_("Requests", row);
  e.context.dailyMaintenance();
  assert.equal(e.tables.get("Requests").getLastRow(), 1);
  assert.equal(e.tables.get("Archive").getLastRow(), 2);
  assert.equal(e.call("trackRequest", p).data.status, "completed");
  assert.equal(
    e.call("stats", { days: 90 }, e.owner).data.totals.revenue,
    7000,
  );
  const old = e.context.rows_("Archive")[0];
  old.createdAt = new Date(Date.now() - 91 * 86400000).toISOString();
  e.context.write_("Archive", old);
  const oldAudit = e.context.rows_("Audit")[0];
  oldAudit.createdAt = new Date(Date.now() - 365 * 86400000).toISOString();
  e.context.write_("Audit", oldAudit);
  const auditCount = e.tables.get("Audit").getLastRow();
  e.context.setSystem_("maintenanceDay", "2000-01-01");
  e.context.dailyMaintenance();
  assert.equal(e.tables.get("Archive").getLastRow(), 2);
  assert.equal(e.call("trackRequest", p).data.status, "completed");
  assert.equal(e.call("trackRequest", p).data.address, p.address);
  assert.equal(e.tables.get("Audit").getLastRow(), auditCount);
  const historic = e.call(
    "history",
    { from: old.createdAt.slice(0, 10), to: old.createdAt.slice(0, 10) },
    e.owner,
  );
  assert.equal(historic.data.orders.length, 1);
});
test("el mantenimiento elimina solo sesiones vencidas y conserva servicios activos antiguos", () => {
  const e = environment(),
    p = payload();
  e.call("createRequest", p);
  const order = e.context.rows_("Requests")[0];
  order.status = "accepted";
  order.createdAt = new Date(Date.now() - 365 * 86400000).toISOString();
  e.context.write_("Requests", order);
  e.context.append_("Sessions", {
    tokenHash: "expired-test",
    userId: "old",
    createdAt: order.createdAt,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  e.cache.set("session:expired-test", "stale");
  e.context.dailyMaintenance();
  assert.equal(e.context.rows_("Requests")[0].id, p.id);
  assert.equal(e.context.rows_("Requests")[0].status, "accepted");
  assert.equal(
    e.context.rows_("Sessions").some((s) => s.tokenHash === "expired-test"),
    false,
  );
  assert.equal(e.cache.has("session:expired-test"), false);
  assert.ok(e.call("me", {}, e.owner).ok);
});
test("un archivo incompleto nunca elimina el original de la hoja operativa", () => {
  const e = environment(),
    p = payload();
  e.call("createRequest", p);
  const order = e.context.rows_("Requests")[0];
  order.status = "completed";
  order.createdAt = new Date(Date.now() - 365 * 86400000).toISOString();
  e.context.write_("Requests", order);
  const append = e.context.appendMany_;
  e.context.appendMany_ = () => {}; // Simula una copia que no llegó a persistirse.
  assert.throws(
    () => e.context.dailyMaintenance(),
    /originales se conservaron/,
  );
  assert.equal(e.context.rows_("Requests")[0].id, p.id);
  assert.equal(e.context.rows_("Archive").length, 0);
  e.context.appendMany_ = append;
  e.context.dailyMaintenance();
  assert.equal(e.context.rows_("Requests").length, 0);
  assert.equal(e.context.rows_("Archive")[0].id, p.id);
});
