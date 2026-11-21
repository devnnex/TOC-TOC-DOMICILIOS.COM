import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  verify,
  randomUUID,
  createHash,
} from "node:crypto";
import { environment } from "./support/gas.mjs";
import { receiver, decryptPush } from "./support/push-crypto.mjs";

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    }),
    jwk = publicKey.export({ format: "jwk" });
  return {
    privateKey: privateKey.export({ format: "jwk" }).d,
    publicKey: Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x, "base64url"),
      Buffer.from(jwk.y, "base64url"),
    ]).toString("base64url"),
    verifyKey: publicKey,
  };
}
function ok(response) {
  assert.equal(response.ok, true, response.error?.message);
  return response.data;
}
function ready() {
  const e = environment(),
    k = keys();
  ok(e.call("configurePush", k, e.owner));
  return { ...e, k };
}
test("avisos: payload cifrado RFC 8291 interoperable con OpenSSL y sin datos personales", () => {
  const e = ready(),
    ua = receiver();
  const grant = ok(
    e.call(
      "subscribePush",
      {
        scope: "admin",
        endpoint: "https://fcm.googleapis.com/fcm/send/encrypted",
        keys: ua.keys,
      },
      e.owner,
    ),
  );
  assert.equal(ok(e.call("pushStatus", grant)).encrypted, true);
  const { p } = order(e);
  const second = {
    ...p,
    id: randomUUID(),
    trackingToken: createHash("sha256").update(randomUUID()).digest("hex"),
  };
  ok(e.call("createRequest", second));
  const request = e.pushTransport.calls.at(-1);
  assert.equal(request.headers["Content-Encoding"], "aes128gcm");
  assert.equal(request.contentType, "application/octet-stream");
  const clear = decryptPush(request.payload, ua);
  assert.equal(clear.v, 1);
  assert.equal(clear.notification.scope, "admin");
  assert.equal(clear.notification.requestId, second.id);
  assert.equal(clear.notification.grantId, grant.id);
  for (const secret of [
    p.name,
    p.phone,
    p.address,
    e.k.privateKey,
    grant.token,
  ])
    assert.equal(JSON.stringify(clear).includes(secret), false);
  const changed = [...request.payload];
  changed[changed.length - 20] ^= 1;
  assert.throws(() => decryptPush(changed, ua));
  ok(
    e.call("createRequest", {
      ...p,
      id: randomUUID(),
      trackingToken: createHash("sha256").update(randomUUID()).digest("hex"),
    }),
  );
  assert.notDeepEqual(
    e.pushTransport.calls.at(-1).payload.slice(0, 86),
    request.payload.slice(0, 86),
  );
  const before = e.context.rows_("PushSubscriptions").length;
  assert.equal(
    e.call(
      "subscribePush",
      {
        scope: "admin",
        endpoint: "https://fcm.googleapis.com/fcm/send/bad",
        keys: { p256dh: "A".repeat(87), auth: ua.keys.auth },
      },
      e.owner,
    ).error.code,
    "VALIDATION",
  );
  assert.equal(e.context.rows_("PushSubscriptions").length, before);
});
test("avisos: el jefe prepara hojas faltantes desde el panel sin tocar servicios", () => {
  const e = environment();
  e.tables.delete("PushEvents");
  e.tables.delete("PushSubscriptions");
  assert.equal(ok(e.call("installationStatus")).state, "ready");
  const before = JSON.stringify(e.context.rows_("Requests"));
  assert.equal(e.call("preparePush").error.code, "UNAUTHORIZED");
  assert.equal(ok(e.call("preparePush", {}, e.owner)).available, true);
  assert.equal(JSON.stringify(e.context.rows_("Requests")), before);
  ok(e.call("preparePush", {}, e.owner));
  assert.equal(
    e.triggers.filter((t) => t.getHandlerFunction() === "deliverPushQueue")
      .length,
    1,
  );
});
test("avisos: dos solicitudes del mismo dispositivo conservan sus permisos independientes", () => {
  const e = ready(),
    first = order(e),
    second = order(e),
    one = sub(e, "client", first.p),
    two = sub(e, "client", second.p);
  assert.notEqual(one.id, two.id);
  assert.equal(e.context.rows_("PushSubscriptions").length, 2);
  accept(e, first.p);
  accept(e, second.p);
  assert.ok(
    ok(e.call("pushInbox", one)).notifications.every(
      (n) => n.requestId === first.p.id,
    ),
  );
  assert.ok(
    ok(e.call("pushInbox", two)).notifications.every(
      (n) => n.requestId === second.p.id,
    ),
  );
  ok(
    e.call(
      "transition",
      { id: first.p.id, revision: 2, status: "completed" },
      e.owner,
    ),
  );
  assert.ok(
    ok(e.call("pushInbox", one)).notifications.every(
      (n) => n.alertKey === "client:" + first.p.id + ":completed",
    ),
  );
  assert.ok(
    ok(e.call("pushInbox", one)).notifications[0].path.includes(first.p.id),
  );
});
function order(e) {
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
  // Queue/transport unit cases separate enqueueing from sending deliberately.
  // The real HTTP path and inline delivery are covered below and in PWA tests.
  return { p, data: e.context.dispatch_("createRequest", p, "") };
}
test("avisos: guardar por HTTP despacha sin una segunda petición del navegador", () => {
  const e = ready(),
    admin = sub(e),
    { p } = order(e);
  const other = {
    ...p,
    id: randomUUID(),
    trackingToken: createHash("sha256").update(randomUUID()).digest("hex"),
  };
  const before = e.pushTransport.calls.length;
  const result = ok(e.call("createRequest", other));
  assert.equal(e.pushTransport.calls.length, before + 1);
  assert.equal(
    e.context.rows_("PushEvents").find((x) => x.id === result.pushDispatch.id)
      .state,
    "sent",
  );
  assert.equal(ok(e.call("pushStatus", admin)).shownAt, "");
  ok(e.call("pushReceived", admin));
  assert.ok(ok(e.call("pushStatus", admin)).shownAt);
  assert.equal(
    e.call("pushStatus", { ...admin, token: "a".repeat(64) }).error.code,
    "UNAUTHORIZED",
  );
  assert.equal(
    e.call("pushStatus", {
      ...admin,
      endpoint: "https://fcm.googleapis.com/fcm/send/other",
    }).error.code,
    "UNAUTHORIZED",
  );
  const serialized = JSON.stringify(ok(e.call("pushStatus", admin)));
  for (const secret of [
    e.k.privateKey,
    admin.token,
    "https://fcm.googleapis.com",
  ])
    assert.equal(serialized.includes(secret), false);
});
function sub(e, scope = "admin", p = {}) {
  return ok(
    e.call(
      "subscribePush",
      { scope, ...p, endpoint: "https://fcm.googleapis.com/fcm/send/" + scope },
      scope === "admin" ? e.owner : "",
    ),
  );
}
function accept(e, p) {
  return ok(
    e.call(
      "transition",
      {
        id: p.id,
        revision: 1,
        status: "accepted",
        courier: "Mensajero de prueba",
        courierPhone: "3101234567",
        fee: 6000,
      },
      e.owner,
    ),
  );
}

test("avisos: instalación idempotente, claves privadas reservadas y firma VAPID verificable", () => {
  const e = ready();
  e.context.setup();
  assert.equal(
    e.triggers.filter((t) => t.getHandlerFunction() === "deliverPushQueue")
      .length,
    1,
  );
  const info = ok(e.call("pushInfo"));
  assert.equal(info.enabled, true);
  assert.equal(JSON.stringify(info).includes(e.k.privateKey), false);
  assert.equal(e.call("configurePush", e.k).error.code, "UNAUTHORIZED");
  const header = e.context.pushVapidHeader_("https://fcm.googleapis.com"),
    jwt = header.split("t=")[1].split(",")[0],
    parts = jwt.split(".");
  assert.equal(
    verify(
      "sha256",
      Buffer.from(parts[0] + "." + parts[1]),
      { key: e.k.verifyKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(parts[2], "base64url"),
    ),
    true,
  );
  const body = JSON.parse(Buffer.from(parts[1], "base64url"));
  assert.equal(body.aud, "https://fcm.googleapis.com");
  assert.ok(body.exp * 1000 > Date.now());
  assert.ok(body.exp * 1000 < Date.now() + 86400000);
  assert.equal(
    JSON.stringify(e.context.rows_("Audit")).includes(e.k.privateKey),
    false,
  );
});
test("avisos: rechaza claves inconsistentes, destinatarios externos y permisos falsificados", () => {
  const e = environment(),
    a = keys(),
    b = keys();
  assert.equal(
    e.call(
      "configurePush",
      { privateKey: a.privateKey, publicKey: b.publicKey },
      e.owner,
    ).error.code,
    "VALIDATION",
  );
  ok(e.call("configurePush", a, e.owner));
  for (const endpoint of [
    "https://example.com/send",
    "http://fcm.googleapis.com/send",
    "https://fcm.googleapis.com.evil.test/send",
    "https://fcm.googleapis.com@127.0.0.1/",
    "https://fcm.googleapis.com:8443/send",
    "https://127.0.0.1/send",
  ])
    assert.equal(
      e.call("subscribePush", { scope: "admin", endpoint }, e.owner).error.code,
      "VALIDATION",
    );
  assert.equal(
    e.call("subscribePush", {
      scope: "admin",
      endpoint: "https://fcm.googleapis.com/send",
      userId: "owner",
      role: "owner",
    }).error.code,
    "UNAUTHORIZED",
  );
  const { p } = order(e);
  assert.equal(
    e.call("subscribePush", {
      ...p,
      trackingToken: "a".repeat(64),
      scope: "client",
      endpoint: "https://web.push.apple.com/send",
    }).error.code,
    "NOT_FOUND",
  );
});
test("avisos: la solicitud encola y despacha sin enviar datos personales al proveedor", () => {
  const e = ready(),
    admin = sub(e),
    { p, data } = order(e);
  assert.ok(data.pushDispatch);
  assert.equal(
    e.call("dispatchPush", { ...data.pushDispatch, token: "incorrecto" }).error
      .code,
    "FORBIDDEN",
  );
  assert.equal(ok(e.call("dispatchPush", data.pushDispatch)).sent, 1);
  const sent = e.pushTransport.calls[0];
  assert.equal(sent.payload, "");
  assert.equal(sent.followRedirects, false);
  assert.equal(sent.headers.TTL, "86400");
  assert.ok(sent.headers.Authorization.startsWith("vapid t="));
  for (const secret of [
    p.name,
    p.phone,
    p.address,
    admin.token,
    e.k.privateKey,
  ])
    assert.equal(JSON.stringify(sent).includes(secret), false);
  assert.equal(ok(e.call("dispatchPush", data.pushDispatch)).sent, 0);
  const inbox = ok(e.call("pushInbox", admin));
  assert.equal(inbox.notifications.length, 1);
  assert.equal(inbox.notifications[0].path, "admin.html#inbox");
  assert.equal(e.call("dashboard", {}, admin.token).error.code, "UNAUTHORIZED");
});
test("avisos: el cliente solo recibe su servicio y una vinculación tardía recupera la aceptación", () => {
  const e = ready(),
    { p } = order(e),
    other = order(e);
  accept(e, p);
  const client = sub(e, "client", p);
  assert.ok(client.pushDispatch);
  const inbox = ok(e.call("pushInbox", client));
  assert.ok(inbox.notifications.length);
  assert.ok(
    inbox.notifications.every(
      (n) => n.title === "Tu domiciliario está en camino",
    ),
  );
  assert.equal(JSON.stringify(inbox).includes(other.p.id), false);
  const foreign = { ...client, token: "f".repeat(64) };
  assert.equal(e.call("pushInbox", foreign).error.code, "UNAUTHORIZED");
  ok(e.call("unsubscribePush", client));
  assert.equal(e.call("pushInbox", client).error.code, "UNAUTHORIZED");
});
test("avisos: entrega con sesión vencida, reintentos y baja del destino caducado", () => {
  const e = ready(),
    admin = sub(e),
    { data } = order(e);
  const session = e.context.rows_("Sessions")[0];
  session.expiresAt = new Date(Date.now() - 1000).toISOString();
  e.context.write_("Sessions", session);
  e.cache.clear();
  assert.ok(ok(e.call("pushInbox", admin)).notifications.length);
  assert.equal(e.call("me", {}, e.owner).error.code, "UNAUTHORIZED");
  e.pushTransport.code = 503;
  assert.equal(ok(e.call("dispatchPush", data.pushDispatch)).retry, true);
  const event = e.context.rows_("PushEvents")[0];
  assert.equal(event.state, "retry");
  event.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
  e.context.write_("PushEvents", event);
  e.pushTransport.code = 201;
  assert.equal(e.context.deliverPushQueue().sent, 1);
  assert.equal(e.context.rows_("PushEvents")[0].state, "sent");
  const next = order(e).data;
  e.pushTransport.code = 410;
  ok(e.call("dispatchPush", next.pushDispatch));
  assert.equal(e.context.rows_("PushSubscriptions")[0].active, false);
  assert.equal(e.call("pushInbox", admin).error.code, "UNAUTHORIZED");
});
test("avisos: cuenta desactivada no recibe avisos y la limpieza solo retira metadatos vencidos", () => {
  const e = ready(),
    admin = sub(e),
    { data } = order(e),
    u = e.context.rows_("Users")[0];
  u.active = false;
  e.context.write_("Users", u);
  e.cache.clear();
  assert.equal(ok(e.call("dispatchPush", data.pushDispatch)).sent, 0);
  assert.equal(e.call("pushInbox", admin).error.code, "UNAUTHORIZED");
  const event = e.context.rows_("PushEvents")[0];
  event.createdAt = new Date(Date.now() - 9 * 86400000).toISOString();
  e.context.write_("PushEvents", event);
  const business = ["Requests", "Archive", "Users", "DailyStats", "Audit"].map(
    (n) => [n, JSON.stringify(e.context.rows_(n))],
  );
  e.context.cleanupPush_();
  assert.equal(e.context.rows_("PushEvents").length, 0);
  for (const [n, data] of business)
    assert.equal(JSON.stringify(e.context.rows_(n)), data);
});
