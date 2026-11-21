/**
 * TOC TOC · Backend Google Sheets / Apps Script V8.
 * 1. Pega este archivo y ejecuta setup(). 2. Despliega como Web App.
 * 3. Usa el código del registro para crear el primer jefe desde admin.html.
 * No publiques el Sheet. No añadas secretos a config.js.
 */
const DB_ID = "1RY7f8Xuel5-tK9e_PQhXgscinU8AQN45pge5p-f16u8";
const TZ = "America/Bogota";
const SESSION_HOURS = 8;
const SCHEMA = {
  Requests: [
    "id",
    "createdAt",
    "updatedAt",
    "status",
    "cityId",
    "name",
    "phone",
    "address",
    "reference",
    "service",
    "notes",
    "lat",
    "lng",
    "accuracy",
    "locationAt",
    "locationMode",
    "trackingHash",
    "courier",
    "courierPhone",
    "fee",
    "acceptedAt",
    "completedAt",
    "acceptedBy",
    "cancelReason",
    "revision",
  ],
  Archive: [
    "id",
    "createdAt",
    "updatedAt",
    "status",
    "cityId",
    "name",
    "phone",
    "address",
    "reference",
    "service",
    "notes",
    "lat",
    "lng",
    "accuracy",
    "locationAt",
    "locationMode",
    "trackingHash",
    "courier",
    "courierPhone",
    "fee",
    "acceptedAt",
    "completedAt",
    "acceptedBy",
    "cancelReason",
    "revision",
  ],
  Users: [
    "id",
    "email",
    "name",
    "role",
    "cityId",
    "passwordHash",
    "active",
    "mustChangePassword",
    "createdAt",
    "updatedAt",
  ],
  Sessions: ["tokenHash", "userId", "createdAt", "expiresAt"],
  DailyStats: [
    "key",
    "day",
    "cityId",
    "requested",
    "accepted",
    "completed",
    "cancelled",
    "revenue",
    "acceptSeconds",
    "envio",
    "compra",
    "diligencia",
  ],
  Cities: [
    "id",
    "name",
    "lat",
    "lng",
    "radiusKm",
    "north",
    "south",
    "east",
    "west",
    "active",
  ],
  Audit: ["id", "createdAt", "userId", "cityId", "event", "entityId"],
  System: ["key", "value", "updatedAt"],
};
let requestBook_;

function setup() {
  return locked_(function () {
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty("PEPPER"))
      props.setProperty("PEPPER", random_() + random_());
    const book = book_();
    book.setSpreadsheetTimeZone(TZ);
    Object.keys(SCHEMA).forEach(function (name) {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      const columns = SCHEMA[name];
      if (sheet.getLastRow() > 0) {
        const current = sheet.getRange(1, 1, 1, columns.length).getValues()[0];
        if (JSON.stringify(current) !== JSON.stringify(columns))
          throw new Error(
            "Esquema incompatible en " +
              name +
              ". No se modificaron sus datos.",
          );
      } else sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
      sheet.setFrozenRows(1);
      sheet
        .getRange(1, 1, 1, columns.length)
        .setBackground("#17232b")
        .setFontColor("#ffffff")
        .setFontWeight("bold");
    });
    if (!rows_("Cities").length)
      append_("Cities", {
        id: "barrancabermeja",
        name: "Barrancabermeja",
        lat: 7.0653,
        lng: -73.8547,
        radiusKm: 12,
        north: 7.16,
        south: 6.97,
        east: -73.75,
        west: -73.96,
        active: true,
      });
    if (!rows_("Users").length) {
      let bootstrap = props.getProperty("BOOTSTRAP_TOKEN");
      if (!bootstrap) {
        bootstrap = random_() + random_();
        props.setProperty("BOOTSTRAP_TOKEN", bootstrap);
      }
      console.log(
        "CÓDIGO PRIVADO DE INSTALACIÓN (no lo publiques): " + bootstrap,
      );
    }
    if (
      !ScriptApp.getProjectTriggers().some(function (t) {
        return t.getHandlerFunction() === "dailyMaintenance";
      })
    )
      ScriptApp.newTrigger("dailyMaintenance")
        .timeBased()
        .everyDays(1)
        .atHour(3)
        .inTimezone(TZ)
        .create();
    setSystem_("schemaVersion", "1");
    console.log(
      "Hojas listas. Despliega como aplicación web, ejecutar como tú, acceso Cualquier persona. Sigue INSTALACION.md.",
    );
    return { ready: true, sheets: Object.keys(SCHEMA) };
  });
}

function doGet() {
  return json_({
    ok: true,
    data: {
      application: "TOC TOC",
      version: "1.0.0",
      transport: "POST text/plain",
    },
  });
}
function doPost(e) {
  try {
    if (!e || !e.postData || e.postData.contents.length > 18000)
      fail_("BAD_REQUEST", "Solicitud no válida.");
    const input = JSON.parse(e.postData.contents);
    if (
      !input ||
      typeof input.action !== "string" ||
      !input.data ||
      typeof input.data !== "object" ||
      Array.isArray(input.data)
    )
      fail_("BAD_REQUEST", "Solicitud no válida.");
    const data = dispatch_(input.action, input.data, input.session || "");
    return json_({ ok: true, data: data });
  } catch (err) {
    if (!err.code) console.error("TOC backend: " + String(err.stack || err));
    return json_({
      ok: false,
      error: {
        code: err.code || "INTERNAL",
        message: err.code
          ? err.message
          : "No pudimos completar la operación. Intenta nuevamente; si persiste, contacta al jefe.",
      },
    });
  }
}
function dispatch_(action, d, session) {
  if (!PropertiesService.getScriptProperties().getProperty("PEPPER"))
    fail_("NOT_READY", "Primero ejecuta setup() en Apps Script.");
  if (action === "challenge") {
    const email = email_(d.email);
    rate_("challenge:" + digest_(email), 25, 300);
    return { salt: hmac_("salt:" + email), iterations: 310000 };
  }
  if (action === "bootstrap") return bootstrap_(d);
  if (action === "login") return login_(d);
  if (action === "createRequest") return createRequest_(d);
  if (action === "trackRequest") return trackRequest_(d);
  if (action === "updateLocation") return updateLocation_(d);
  if (action === "cancelRequest") return cancelRequest_(d);
  const actor = authenticate_(session);
  actor._token = session;
  if (action === "logout")
    return locked_(function () {
      revokeSession_(session);
      return { loggedOut: true };
    });
  if (action === "changePassword") return changePassword_(actor, d, session);
  if (truth_(actor.mustChangePassword) && action !== "me")
    fail_(
      "PASSWORD_CHANGE_REQUIRED",
      "Cambia tu contraseña inicial para operar.",
    );
  if (action === "me")
    return { user: publicUser_(actor), city: city_(actor.cityId) };
  if (action === "dashboard") return dashboard_(actor, d);
  if (action === "transition") return transition_(actor, d);
  if (action === "stats") return stats_(actor.cityId, Number(d.days) || 30);
  if (action === "history") return history_(actor, d);
  if (action === "listUsers") {
    owner_(actor);
    return users_()
      .filter(function (u) {
        return u.cityId === actor.cityId;
      })
      .map(publicUser_);
  }
  if (action === "createUser") return createUser_(actor, d);
  if (action === "setUserActive") return setUserActive_(actor, d);
  if (action === "resetPassword") return resetPassword_(actor, d);
  fail_("UNKNOWN_ACTION", "Operación desconocida.");
}

function bootstrap_(d) {
  return locked_(function () {
    rateUnlocked_("bootstrap", 5, 600);
    const p = PropertiesService.getScriptProperties(),
      expected = p.getProperty("BOOTSTRAP_TOKEN");
    if (
      rows_("Users").length ||
      !expected ||
      !equal_(String(d.bootstrapToken || ""), expected)
    )
      fail_("FORBIDDEN", "Código de instalación incorrecto o ya utilizado.");
    const email = email_(d.email);
    key_(d.passwordKey);
    const user = {
      id: random_(),
      email: email,
      name: text_(d.name, 70, true),
      role: "owner",
      cityId: "barrancabermeja",
      passwordHash: hmac_("password:" + d.passwordKey),
      active: true,
      mustChangePassword: false,
      createdAt: now_(),
      updatedAt: now_(),
    };
    append_("Users", user);
    cache_().remove("users");
    p.deleteProperty("BOOTSTRAP_TOKEN");
    audit_(user, "OWNER_CREATED", user.id);
    return openSession_(user);
  });
}
function login_(d) {
  const result = locked_(function () {
    const email = email_(d.email);
    key_(d.passwordKey);
    rateUnlocked_("login:" + digest_(email), 8, 600);
    rateUnlocked_("all-logins", 100, 600);
    const user = users_().find(function (u) {
      return u.email === email;
    });
    const candidate = hmac_("password:" + d.passwordKey);
    if (!user || !truth_(user.active) || !equal_(candidate, user.passwordHash))
      fail_(
        "INVALID_CREDENTIALS",
        "Correo o contraseña incorrectos, o cuenta desactivada.",
      );
    city_(user.cityId);
    audit_(user, "LOGIN", user.id);
    return openSession_(user);
  });
  // El mantenimiento no bloquea la autenticación si hay un problema operativo.
  try {
    scheduleMaintenance_();
  } catch (err) {
    console.error("Mantenimiento pendiente: " + err.message);
  }
  return result;
}
function openSession_(user) {
  const token = random_() + random_();
  const expiresAt = new Date(
    Date.now() + SESSION_HOURS * 3600000,
  ).toISOString();
  append_("Sessions", {
    tokenHash: digest_(token),
    userId: user.id,
    createdAt: now_(),
    expiresAt: expiresAt,
  });
  return {
    token: token,
    expiresAt: expiresAt,
    user: publicUser_(user),
    city: city_(user.cityId),
  };
}
function authenticate_(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token)))
    fail_("UNAUTHORIZED", "Inicia sesión para continuar.");
  const hash = digest_(token),
    key = "session:" + hash;
  let session = cached_(
    key,
    function () {
      return (
        rows_("Sessions").find(function (s) {
          return s.tokenHash === hash;
        }) || null
      );
    },
    300,
  );
  if (!session || new Date(session.expiresAt).getTime() <= Date.now())
    fail_("UNAUTHORIZED", "Tu sesión venció. Ingresa nuevamente.");
  const user = users_().find(function (u) {
    return u.id === session.userId;
  });
  if (!user || !truth_(user.active))
    fail_("UNAUTHORIZED", "Esta cuenta ya no tiene acceso.");
  return user;
}
function revokeSession_(token) {
  const hash = digest_(token);
  cache_().remove("session:" + hash);
  const row = rows_("Sessions").find(function (s) {
    return s.tokenHash === hash;
  });
  if (row) sheet_("Sessions").deleteRow(row._row);
}
function revokeUserSessions_(id, exceptHash) {
  rows_("Sessions")
    .reverse()
    .forEach(function (s) {
      if (s.userId === id && s.tokenHash !== exceptHash) {
        cache_().remove("session:" + s.tokenHash);
        sheet_("Sessions").deleteRow(s._row);
      }
    });
}
function changePassword_(user, d, session) {
  return locked_(function () {
    const fresh = authenticate_(session);
    key_(d.currentKey);
    key_(d.newKey);
    rateUnlocked_("password:" + user.id, 8, 600);
    if (!equal_(hmac_("password:" + d.currentKey), fresh.passwordHash))
      fail_("INVALID_CREDENTIALS", "La contraseña actual no es correcta.");
    if (equal_(d.currentKey, d.newKey))
      fail_("VALIDATION", "Elige una contraseña diferente a la actual.");
    fresh.passwordHash = hmac_("password:" + d.newKey);
    fresh.mustChangePassword = false;
    fresh.updatedAt = now_();
    write_("Users", fresh);
    cache_().remove("users");
    revokeUserSessions_(user.id, digest_(session));
    audit_(fresh, "PASSWORD_CHANGED", user.id);
    return { user: publicUser_(fresh) };
  });
}
function createUser_(actor, d) {
  owner_(actor);
  return locked_(function () {
    actor = authenticate_(actor._token);
    owner_(actor);
    const email = email_(d.email);
    key_(d.passwordKey);
    if (
      users_().some(function (u) {
        return u.email === email;
      })
    )
      fail_("CONFLICT", "Ya existe una cuenta con este correo.");
    const user = {
      id: random_(),
      email: email,
      name: text_(d.name, 70, true),
      role: "admin",
      cityId: actor.cityId,
      passwordHash: hmac_("password:" + d.passwordKey),
      active: true,
      mustChangePassword: true,
      createdAt: now_(),
      updatedAt: now_(),
    };
    append_("Users", user);
    cache_().remove("users");
    audit_(actor, "ADMIN_CREATED", user.id);
    return publicUser_(user);
  });
}
function setUserActive_(actor, d) {
  owner_(actor);
  return locked_(function () {
    actor = authenticate_(actor._token);
    owner_(actor);
    const u = users_().find(function (x) {
      return x.id === d.id && x.cityId === actor.cityId;
    });
    if (!u || u.role !== "admin" || u.id === actor.id)
      fail_(
        "FORBIDDEN",
        "Solo puedes activar o desactivar administradores de tu ciudad.",
      );
    if (typeof d.active !== "boolean")
      fail_("VALIDATION", "Estado de cuenta inválido.");
    u.active = d.active;
    u.updatedAt = now_();
    write_("Users", u);
    cache_().remove("users");
    revokeUserSessions_(u.id);
    audit_(actor, d.active ? "ADMIN_ENABLED" : "ADMIN_DISABLED", u.id);
    return publicUser_(u);
  });
}
function resetPassword_(actor, d) {
  owner_(actor);
  return locked_(function () {
    actor = authenticate_(actor._token);
    owner_(actor);
    key_(d.passwordKey);
    const u = users_().find(function (x) {
      return x.id === d.id && x.cityId === actor.cityId && x.role === "admin";
    });
    if (!u) fail_("NOT_FOUND", "No encontramos este administrador.");
    u.passwordHash = hmac_("password:" + d.passwordKey);
    u.mustChangePassword = true;
    u.updatedAt = now_();
    write_("Users", u);
    cache_().remove("users");
    revokeUserSessions_(u.id);
    audit_(actor, "ADMIN_PASSWORD_RESET", u.id);
    return { reset: true };
  });
}

function createRequest_(d) {
  return locked_(function () {
    if (d.website) fail_("VALIDATION", "Solicitud no válida.");
    if (!/^[a-f0-9-]{36}$/.test(String(d.id)))
      fail_("VALIDATION", "Identificador no válido.");
    trackingKey_(d.trackingToken);
    const previous = findRequest_(d.id, true);
    if (previous) {
      if (!equal_(previous.trackingHash, digest_(d.trackingToken)))
        fail_("FORBIDDEN", "No tienes acceso a esta solicitud.");
      return publicOrder_(previous);
    }
    const city = city_(text_(d.cityId, 60, true)),
      phone = phone_(d.phone);
    if (!(d.consent === true || d.consent === "on"))
      fail_(
        "VALIDATION",
        "Autoriza el uso de los datos para atender tu servicio.",
      );
    if (!["envio", "compra", "diligencia"].includes(d.service))
      fail_("VALIDATION", "Elige un servicio válido.");
    const location = location_(d, city);
    const order = Object.assign(
      {
        id: d.id,
        createdAt: now_(),
        updatedAt: now_(),
        status: "pending",
        cityId: city.id,
        name: text_(d.name, 70, true),
        phone: phone,
        address: text_(d.address, 220, true),
        reference: text_(d.reference, 220),
        service: d.service,
        notes: text_(d.notes, 500),
        trackingHash: digest_(d.trackingToken),
        courier: "",
        courierPhone: "",
        fee: "",
        acceptedAt: "",
        completedAt: "",
        acceptedBy: "",
        cancelReason: "",
        revision: 1,
      },
      location,
    );
    rateUnlocked_("create-phone:" + digest_(phone), 3, 300);
    rateUnlocked_("create-global", 60, 60);
    const sheet = sheet_("Requests");
    if (sheet.getLastRow() > 10000)
      fail_(
        "CAPACITY",
        "El equipo debe revisar la capacidad de operación antes de recibir más servicios.",
      );
    append_("Requests", order);
    updateStats_(order, "created");
    invalidateOrder_(order);
    audit_({ id: "client", cityId: city.id }, "REQUEST_CREATED", order.id);
    return publicOrder_(order);
  });
}
function trackRequest_(d) {
  let o = authorizeTracking_(d);
  if (
    o.status === "pending" &&
    Date.now() - new Date(o.createdAt).getTime() > 3600000
  ) {
    o = locked_(function () {
      const fresh = authorizeTracking_(d, true);
      if (fresh.status !== "pending") return fresh;
      fresh.status = "cancelled";
      fresh.cancelReason =
        "La solicitud venció sin ser aceptada. Puedes solicitar un nuevo servicio.";
      fresh.updatedAt = now_();
      fresh.revision = Number(fresh.revision) + 1;
      write_("Requests", fresh);
      updateStats_(fresh, "cancelled");
      invalidateOrder_(fresh);
      return fresh;
    });
  }
  return publicOrder_(o);
}
function updateLocation_(d) {
  return locked_(function () {
    const o = authorizeTracking_(d, true);
    if (!["pending", "accepted"].includes(o.status)) return { updated: false };
    if (o.locationMode !== "gps")
      fail_("VALIDATION", "Este servicio utiliza dirección manual.");
    if (o.locationAt && Date.now() - new Date(o.locationAt).getTime() < 15000)
      return { updated: false };
    const loc = location_(
      Object.assign({}, d, { locationMode: "gps" }),
      city_(o.cityId),
    );
    if (loc.lat === "") fail_("VALIDATION", "Ubicación incompleta.");
    Object.assign(o, loc);
    o.updatedAt = now_();
    write_("Requests", o);
    invalidateOrder_(o);
    return { updated: true };
  });
}
function cancelRequest_(d) {
  return locked_(function () {
    const o = authorizeTracking_(d, true);
    if (o.status === "cancelled") return publicOrder_(o);
    if (o.status !== "pending")
      fail_(
        "CONFLICT",
        "El servicio ya fue aceptado. Contacta al equipo para coordinar una cancelación.",
      );
    o.status = "cancelled";
    o.cancelReason = "Cancelado por el cliente.";
    o.updatedAt = now_();
    o.revision = Number(o.revision) + 1;
    write_("Requests", o);
    updateStats_(o, "cancelled");
    invalidateOrder_(o);
    audit_({ id: "client", cityId: o.cityId }, "REQUEST_CANCELLED", o.id);
    return publicOrder_(o);
  });
}
function authorizeTracking_(d, fresh) {
  trackingKey_(d.trackingToken);
  const o = findRequest_(text_(d.id, 40, true), fresh);
  if (!o || !equal_(o.trackingHash, digest_(d.trackingToken)))
    fail_("NOT_FOUND", "No se encontró este seguimiento.");
  return o;
}
function findRequest_(id, fresh) {
  const key = "order:" + digest_(id);
  if (!fresh) {
    const value = cache_().get(key);
    if (value) return JSON.parse(value);
  }
  let found;
  ["Requests", "Archive"].some(function (name) {
    const s = sheet_(name);
    if (s.getLastRow() < 2) return false;
    const cell = s
      .getRange(2, 1, s.getLastRow() - 1, 1)
      .createTextFinder(id)
      .matchEntireCell(true)
      .findNext();
    if (cell) {
      found = object_(
        name,
        s.getRange(cell.getRow(), 1, 1, SCHEMA[name].length).getValues()[0],
        cell.getRow(),
      );
      found._sheet = name;
      return true;
    }
    return false;
  });
  if (found) cache_().put(key, JSON.stringify(found), 30);
  return found;
}
function transition_(actor, d) {
  return locked_(function () {
    actor = authenticate_(actor._token);
    if (truth_(actor.mustChangePassword))
      fail_(
        "PASSWORD_CHANGE_REQUIRED",
        "Cambia tu contraseña inicial para operar.",
      );
    const o = findRequest_(text_(d.id, 40, true), true);
    if (!o || o.cityId !== actor.cityId)
      fail_("NOT_FOUND", "No se encontró este servicio en tu ciudad.");
    if (o._sheet === "Archive")
      fail_("CONFLICT", "Este servicio está archivado.");
    if (Number(d.revision) !== Number(o.revision))
      fail_(
        "CONFLICT",
        "El servicio cambió. Actualiza el panel y revisa su estado antes de continuar.",
      );
    const allowed = {
      pending: ["accepted", "cancelled"],
      accepted: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[o.status].includes(d.status))
      fail_("CONFLICT", "Este cambio de estado ya no está disponible.");
    if (d.status === "accepted") {
      o.courier = text_(d.courier, 70, true);
      o.courierPhone = phone_(d.courierPhone);
      const fee = Number(d.fee);
      if (d.fee === "" || !Number.isFinite(fee) || fee < 0 || fee > 1000000)
        fail_(
          "VALIDATION",
          "Indica una tarifa válida entre 0 y 1.000.000 COP.",
        );
      o.fee = fee;
      o.acceptedAt = now_();
      o.acceptedBy = actor.id;
    }
    if (d.status === "completed") o.completedAt = now_();
    if (d.status === "cancelled")
      o.cancelReason = text_(d.cancelReason, 220, true);
    o.status = d.status;
    o.updatedAt = now_();
    o.revision = Number(o.revision) + 1;
    write_("Requests", o);
    updateStats_(o, d.status);
    invalidateOrder_(o);
    audit_(actor, "REQUEST_" + d.status.toUpperCase(), o.id);
    return adminOrder_(o);
  });
}
function dashboard_(actor, d) {
  const rev = revision_(actor.cityId);
  if (d.revision && d.revision === rev && d.day === day_(now_()))
    return { unchanged: true, revision: rev, day: day_(now_()) };
  const orders = cached_(
    "dashboard:" + actor.cityId + ":" + rev,
    function () {
      return rows_("Requests")
        .filter(function (o) {
          return (
            o.cityId === actor.cityId &&
            (["pending", "accepted"].includes(o.status) ||
              day_(o.createdAt) === day_(now_()))
          );
        })
        .sort(function (a, b) {
          return b.createdAt.localeCompare(a.createdAt);
        })
        .map(adminOrder_);
    },
    45,
  );
  return {
    orders: orders,
    revision: rev,
    day: day_(now_()),
    today: stats_(actor.cityId, 1).totals,
    city: city_(actor.cityId),
  };
}
function updateStats_(o, event) {
  const key = o.cityId + ":" + day_(o.createdAt),
    s = rows_("DailyStats").find(function (x) {
      return x.key === key;
    }) || {
      key: key,
      day: day_(o.createdAt),
      cityId: o.cityId,
      requested: 0,
      accepted: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
      acceptSeconds: 0,
      envio: 0,
      compra: 0,
      diligencia: 0,
    };
  if (event === "created") {
    s.requested = Number(s.requested) + 1;
    s[o.service] = Number(s[o.service]) + 1;
  }
  if (event === "accepted") {
    s.accepted = Number(s.accepted) + 1;
    s.acceptSeconds =
      Number(s.acceptSeconds) +
      Math.max(
        0,
        Math.round((new Date(o.acceptedAt) - new Date(o.createdAt)) / 1000),
      );
  }
  if (event === "completed") {
    s.completed = Number(s.completed) + 1;
    s.revenue = Number(s.revenue) + Number(o.fee || 0);
  }
  if (event === "cancelled") s.cancelled = Number(s.cancelled) + 1;
  if (s._row) write_("DailyStats", s);
  else append_("DailyStats", s);
}
function stats_(cityId, days) {
  if (![1, 7, 30, 90].includes(days))
    fail_("VALIDATION", "Período de estadísticas inválido.");
  const all = rows_("DailyStats").filter(function (s) {
    return s.cityId === cityId;
  });
  const today = day_(now_()),
    base = new Date(today + "T12:00:00-05:00"),
    list = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = new Date(base.getTime() - i * 86400000),
      key = day_(at);
    list.push(
      all.find(function (x) {
        return x.day === key;
      }) || {
        day: key,
        requested: 0,
        accepted: 0,
        completed: 0,
        cancelled: 0,
        revenue: 0,
        acceptSeconds: 0,
        envio: 0,
        compra: 0,
        diligencia: 0,
      },
    );
  }
  const totals = {
    requested: 0,
    accepted: 0,
    completed: 0,
    cancelled: 0,
    revenue: 0,
    acceptSeconds: 0,
    envio: 0,
    compra: 0,
    diligencia: 0,
  };
  list.forEach(function (s) {
    Object.keys(totals).forEach(function (k) {
      totals[k] += Number(s[k]) || 0;
    });
  });
  totals.acceptanceRate = totals.requested
    ? Math.round((totals.accepted / totals.requested) * 100)
    : 0;
  totals.avgAcceptSeconds = totals.accepted
    ? Math.round(totals.acceptSeconds / totals.accepted)
    : 0;
  return {
    days: list.map(function (x) {
      const copy = Object.assign({}, x);
      delete copy._row;
      return copy;
    }),
    totals: totals,
  };
}
function history_(actor, d) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(d.from)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(d.to)) ||
    d.from > d.to
  )
    fail_("VALIDATION", "Elige un rango de fechas válido.");
  if (
    d.status &&
    !["pending", "accepted", "completed", "cancelled"].includes(d.status)
  )
    fail_("VALIDATION", "Estado inválido.");
  const offset = Math.max(
    0,
    Math.min(100000, Math.floor(Number(d.offset) || 0)),
  );
  const all = rows_("Requests")
    .concat(rows_("Archive"))
    .filter(function (o) {
      const day = day_(o.createdAt);
      return (
        o.cityId === actor.cityId &&
        day >= d.from &&
        day <= d.to &&
        (!d.status || o.status === d.status)
      );
    })
    .sort(function (a, b) {
      return b.createdAt.localeCompare(a.createdAt);
    });
  return {
    orders: all.slice(offset, offset + 50).map(adminOrder_),
    nextOffset: offset + 50 < all.length ? offset + 50 : null,
    total: all.length,
  };
}

/** El login solo agenda; no espera al archivado y a la limpieza. */
function scheduleMaintenance_() {
  return locked_(function () {
    if (system_("maintenanceDay") === day_(now_())) return;
    const props = PropertiesService.getScriptProperties();
    const queued = Number(props.getProperty("maintenanceQueuedAt") || 0);
    if (Date.now() - queued < 900000) return;
    ScriptApp.newTrigger("maintenanceAfterLogin")
      .timeBased()
      .after(5000)
      .create();
    props.setProperty("maintenanceQueuedAt", String(Date.now()));
  });
}
function maintenanceAfterLogin() {
  try {
    dailyMaintenance();
  } finally {
    ScriptApp.getProjectTriggers()
      .filter(function (t) {
        return t.getHandlerFunction() === "maintenanceAfterLogin";
      })
      .forEach(function (t) {
        ScriptApp.deleteTrigger(t);
      });
    PropertiesService.getScriptProperties().deleteProperty(
      "maintenanceQueuedAt",
    );
  }
}
/** Ejecutado por el trigger diario o el trabajo en segundo plano. Idempotente. */
function dailyMaintenance() {
  return locked_(function () {
    const today = day_(now_()),
      previous = system_("maintenanceDay");
    if (previous === today) return { skipped: true };
    const timestamp = Date.now(),
      statsDays = {};
    // Solicitudes sin aceptar durante 60 minutos expiran con aviso al cliente.
    rows_("Requests").forEach(function (o) {
      if (
        o.status === "pending" &&
        timestamp - new Date(o.createdAt).getTime() > 3600000
      ) {
        o.status = "cancelled";
        o.cancelReason =
          "La solicitud venció sin ser aceptada. Puedes solicitar un nuevo servicio.";
        o.updatedAt = now_();
        o.revision = Number(o.revision) + 1;
        write_("Requests", o);
        updateStats_(o, "cancelled");
        invalidateOrder_(o);
      }
    });
    const active = rows_("Requests"),
      archived = rows_("Archive"),
      archiveIds = {};
    archived.forEach(function (o) {
      archiveIds[o.id] = true;
    });
    const move = active.filter(function (o) {
      return (
        ["completed", "cancelled"].includes(o.status) &&
        timestamp - new Date(o.createdAt).getTime() > 30 * 86400000
      );
    });
    const fresh = move.filter(function (o) {
      return !archiveIds[o.id];
    });
    if (fresh.length) appendMany_("Archive", fresh);
    // Solo se retiran de la hoja operativa después de comprobar la copia completa.
    // El historial y la auditoría se conservan sin caducidad automática.
    if (move.length) {
      SpreadsheetApp.flush();
      const savedById = {};
      rows_("Archive").forEach(function (o) {
        savedById[o.id] = o;
      });
      const verified = move.every(function (o) {
        const saved = savedById[o.id];
        return (
          saved &&
          SCHEMA.Requests.every(function (key) {
            return (
              String(saved[key] == null ? "" : saved[key]) ===
              String(o[key] == null ? "" : o[key])
            );
          })
        );
      });
      if (!verified)
        fail_(
          "ARCHIVE_VERIFY_FAILED",
          "No se pudo verificar el archivo. Las solicitudes originales se conservaron.",
        );
    }
    const removeIds = {};
    move.forEach(function (o) {
      removeIds[o.id] = true;
    });
    deleteRows_(
      "Requests",
      active.filter(function (o) {
        return !!removeIds[o.id];
      }),
    );
    rows_("Sessions")
      .filter(function (s) {
        return new Date(s.expiresAt).getTime() <= timestamp;
      })
      .forEach(function (s) {
        cache_().remove("session:" + s.tokenHash);
      });
    deleteRows_(
      "Sessions",
      rows_("Sessions").filter(function (s) {
        return new Date(s.expiresAt).getTime() <= timestamp;
      }),
    );
    reconcileStats_();
    const cacheKeys = active.concat(archived).map(function (o) {
      statsDays[o.cityId] = true;
      return "order:" + digest_(o.id);
    });
    for (let i = 0; i < cacheKeys.length; i += 100)
      cache_().removeAll(cacheKeys.slice(i, i + 100));
    Object.keys(statsDays).forEach(bumpRevision_);
    setSystem_("maintenanceDay", today);
    setSystem_("maintenanceAt", now_());
    return { archived: move.length, completedAt: now_() };
  });
}

/** Repara contadores si una ejecución anterior falló entre dos escrituras de Sheets. */
function reconcileStats_() {
  const since = day_(new Date(Date.now() - 89 * 86400000)),
    grouped = {},
    seen = {};
  rows_("Requests")
    .concat(rows_("Archive"))
    .forEach(function (o) {
      if (seen[o.id]) return;
      seen[o.id] = true;
      const day = day_(o.createdAt);
      if (day < since) return;
      const key = o.cityId + ":" + day;
      const s = grouped[key] || {
        key: key,
        day: day,
        cityId: o.cityId,
        requested: 0,
        accepted: 0,
        completed: 0,
        cancelled: 0,
        revenue: 0,
        acceptSeconds: 0,
        envio: 0,
        compra: 0,
        diligencia: 0,
      };
      s.requested++;
      s[o.service] = Number(s[o.service] || 0) + 1;
      if (o.acceptedAt) {
        s.accepted++;
        s.acceptSeconds += Math.max(
          0,
          Math.round((new Date(o.acceptedAt) - new Date(o.createdAt)) / 1000),
        );
      }
      if (o.status === "completed") {
        s.completed++;
        s.revenue += Number(o.fee || 0);
      }
      if (o.status === "cancelled") s.cancelled++;
      grouped[key] = s;
    });
  const existing = rows_("DailyStats");
  const result = existing
    .filter(function (s) {
      return s.day < since;
    })
    .concat(
      Object.keys(grouped).map(function (key) {
        return grouped[key];
      }),
    );
  if (result.length)
    sheet_("DailyStats")
      .getRange(2, 1, result.length, SCHEMA.DailyStats.length)
      .setValues(
        result.map(function (o) {
          return SCHEMA.DailyStats.map(function (k) {
            return cell_(o[k]);
          });
        }),
      );
  if (existing.length > result.length)
    sheet_("DailyStats").deleteRows(
      result.length + 2,
      existing.length - result.length,
    );
}

function location_(d, city) {
  if (d.lat == null || d.lat === "" || d.lng == null || d.lng === "") {
    if (d.locationMode === "gps")
      fail_("VALIDATION", "No recibimos las coordenadas GPS.");
    return {
      lat: "",
      lng: "",
      accuracy: "",
      locationAt: "",
      locationMode: "manual",
    };
  }
  const lat = Number(d.lat),
    lng = Number(d.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    fail_("VALIDATION", "Coordenadas inválidas.");
  const r = Math.PI / 180,
    a =
      Math.sin(((lat - city.lat) * r) / 2) ** 2 +
      Math.cos(lat * r) *
        Math.cos(city.lat * r) *
        Math.sin(((lng - city.lng) * r) / 2) ** 2;
  if (6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) > city.radiusKm)
    fail_(
      "OUTSIDE_CITY",
      "La ubicación está fuera de la zona de servicio de " + city.name + ".",
    );
  const accuracy =
    d.accuracy === "" || d.accuracy == null ? "" : Number(d.accuracy);
  if (
    accuracy !== "" &&
    (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)
  )
    fail_("VALIDATION", "Precisión GPS inválida.");
  return {
    lat: lat,
    lng: lng,
    accuracy: accuracy,
    locationAt: now_(),
    locationMode: d.locationMode === "gps" ? "gps" : "manual_place",
  };
}
function city_(id) {
  const c = cached_(
    "city:" + id,
    function () {
      return (
        rows_("Cities").find(function (c) {
          return c.id === id && truth_(c.active);
        }) || null
      );
    },
    60,
  );
  if (!c) fail_("VALIDATION", "La ciudad no está disponible.");
  return {
    id: c.id,
    name: c.name,
    lat: Number(c.lat),
    lng: Number(c.lng),
    radiusKm: Number(c.radiusKm),
    bounds: {
      north: Number(c.north),
      south: Number(c.south),
      east: Number(c.east),
      west: Number(c.west),
    },
  };
}
function publicOrder_(o) {
  const safe = {};
  [
    "id",
    "createdAt",
    "updatedAt",
    "status",
    "cityId",
    "address",
    "reference",
    "service",
    "courier",
    "courierPhone",
    "fee",
    "acceptedAt",
    "completedAt",
    "cancelReason",
    "revision",
  ].forEach(function (k) {
    safe[k] = o[k];
  });
  return safe;
}
function adminOrder_(o) {
  const copy = Object.assign({}, o);
  delete copy.trackingHash;
  delete copy._row;
  delete copy._sheet;
  return copy;
}
function publicUser_(u) {
  const safe = {};
  [
    "id",
    "email",
    "name",
    "role",
    "cityId",
    "active",
    "mustChangePassword",
    "createdAt",
  ].forEach(function (k) {
    safe[k] = u[k];
  });
  return safe;
}
function users_() {
  return cached_(
    "users",
    function () {
      return rows_("Users");
    },
    60,
  );
}
function owner_(u) {
  if (u.role !== "owner")
    fail_("FORBIDDEN", "Solo un jefe puede gestionar administradores.");
}
function revision_(city) {
  return (
    PropertiesService.getScriptProperties().getProperty("rev:" + city) || "0"
  );
}
function bumpRevision_(city) {
  PropertiesService.getScriptProperties().setProperty("rev:" + city, random_());
}
function invalidateOrder_(o) {
  cache_().remove("order:" + digest_(o.id));
  bumpRevision_(o.cityId);
}
function book_() {
  if (!requestBook_) requestBook_ = SpreadsheetApp.openById(DB_ID);
  return requestBook_;
}
function sheet_(name) {
  const s = book_().getSheetByName(name);
  if (!s) fail_("NOT_READY", "Falta la hoja " + name + ". Ejecuta setup().");
  return s;
}
function rows_(name) {
  const s = sheet_(name),
    count = s.getLastRow() - 1;
  return count < 1
    ? []
    : s
        .getRange(2, 1, count, SCHEMA[name].length)
        .getValues()
        .map(function (row, i) {
          return object_(name, row, i + 2);
        });
}
function object_(name, values, row) {
  const o = { _row: row };
  SCHEMA[name].forEach(function (k, i) {
    const v = values[i];
    o[k] =
      v instanceof Date
        ? v.toISOString()
        : typeof v === "string" && /^'[=+\-@]/.test(v)
          ? v.slice(1)
          : v;
  });
  return o;
}
function cell_(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}
function append_(name, o) {
  const s = sheet_(name);
  const row = s.getLastRow() + 1;
  s.getRange(row, 1, 1, SCHEMA[name].length).setValues([
    SCHEMA[name].map(function (k) {
      return cell_(o[k]);
    }),
  ]);
  o._row = row;
}
function appendMany_(name, objects) {
  if (!objects.length) return;
  const s = sheet_(name);
  s.getRange(
    s.getLastRow() + 1,
    1,
    objects.length,
    SCHEMA[name].length,
  ).setValues(
    objects.map(function (o) {
      return SCHEMA[name].map(function (k) {
        return cell_(o[k]);
      });
    }),
  );
}
function write_(name, o) {
  if (!o._row) throw new Error("Fila no encontrada en " + name);
  sheet_(name)
    .getRange(o._row, 1, 1, SCHEMA[name].length)
    .setValues([
      SCHEMA[name].map(function (k) {
        return cell_(o[k]);
      }),
    ]);
}
function deleteRows_(name, objects) {
  const indices = objects
    .map(function (o) {
      return o._row;
    })
    .sort(function (a, b) {
      return b - a;
    });
  if (!indices.length) return;
  const s = sheet_(name);
  let high = indices[0],
    low = high;
  for (let i = 1; i <= indices.length; i++) {
    if (i < indices.length && indices[i] === low - 1) low = indices[i];
    else {
      s.deleteRows(low, high - low + 1);
      high = indices[i];
      low = high;
    }
  }
}
function audit_(u, event, id) {
  append_("Audit", {
    id: random_(),
    createdAt: now_(),
    userId: u.id,
    cityId: u.cityId,
    event: event,
    entityId: id,
  });
}
function system_(key) {
  const row = rows_("System").find(function (r) {
    return r.key === key;
  });
  return row ? row.value : "";
}
function setSystem_(key, value) {
  const row = rows_("System").find(function (r) {
    return r.key === key;
  }) || { key: key };
  row.value = value;
  row.updatedAt = now_();
  if (row._row) write_("System", row);
  else append_("System", row);
}
function now_() {
  return new Date().toISOString();
}
function day_(at) {
  return Utilities.formatDate(new Date(at), TZ, "yyyy-MM-dd");
}
function cache_() {
  return CacheService.getScriptCache();
}
function cached_(key, fn, ttl) {
  const stored = cache_().get(key);
  if (stored) return JSON.parse(stored);
  const result = fn();
  const json = JSON.stringify(result);
  // Límite conservador que también deja margen a texto UTF-8 de varios bytes.
  if (json.length < 25000) cache_().put(key, json, ttl);
  return result;
}
function locked_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000))
    fail_(
      "BUSY",
      "El equipo está procesando otra operación. Intenta nuevamente.",
    );
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
function rate_(key, max, seconds) {
  return locked_(function () {
    rateUnlocked_(key, max, seconds);
  });
}
function rateUnlocked_(key, max, seconds) {
  const k = "rate:" + digest_(key),
    raw = cache_().get(k),
    state = raw ? JSON.parse(raw) : { n: 0, end: Date.now() + seconds * 1000 };
  if (state.end <= Date.now()) {
    state.n = 0;
    state.end = Date.now() + seconds * 1000;
  }
  if (state.n >= max)
    fail_(
      "RATE_LIMIT",
      "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
    );
  state.n++;
  cache_().put(
    k,
    JSON.stringify(state),
    Math.max(1, Math.ceil((state.end - Date.now()) / 1000)),
  );
}
function random_() {
  return Utilities.getUuid().replace(/-/g, "");
}
function bytesHex_(bytes) {
  return bytes
    .map(function (b) {
      return ((b + 256) % 256).toString(16).padStart(2, "0");
    })
    .join("");
}
function digest_(s) {
  return bytesHex_(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(s),
      Utilities.Charset.UTF_8,
    ),
  );
}
function hmac_(s) {
  return bytesHex_(
    Utilities.computeHmacSha256Signature(
      String(s),
      PropertiesService.getScriptProperties().getProperty("PEPPER"),
      Utilities.Charset.UTF_8,
    ),
  );
}
function equal_(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function key_(s) {
  if (!/^[a-f0-9]{64}$/.test(String(s)))
    fail_("VALIDATION", "Credencial no válida.");
}
function trackingKey_(s) {
  key_(s);
}
function text_(v, max, required) {
  const s = v == null ? "" : String(v).trim();
  if (
    s.length > max ||
    (required && !s) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)
  )
    fail_(
      "VALIDATION",
      "Revisa los campos: hay texto vacío, demasiado largo o no válido.",
    );
  return s;
}
function email_(v) {
  const s = text_(v, 120, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    fail_("VALIDATION", "Escribe un correo válido.");
  return s;
}
function phone_(v) {
  const p = text_(v, 20, true)
    .replace(/[\s()-]/g, "")
    .replace(/^\+57/, "")
    .replace(/^57(?=3\d{9}$)/, "");
  if (!/^3\d{9}$/.test(p))
    fail_(
      "VALIDATION",
      "Escribe un celular colombiano de 10 dígitos que empiece por 3.",
    );
  return p;
}
function truth_(v) {
  return v === true || String(v).toLowerCase() === "true";
}
function fail_(code, message) {
  const e = new Error(message);
  e.code = code;
  throw e;
}
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
