/**
 * TOC TOC · Backend Google Sheets / Apps Script V8.
 * 1. Pega este archivo y ejecuta setup(). 2. Despliega como Web App.
 * 3. Usa el código del registro para crear el primer jefe desde admin.html.
 * No publiques el Sheet. No añadas secretos a config.js.
 */
const DB_ID = "1RY7f8Xuel5-tK9e_PQhXgscinU8AQN45pge5p-f16u8";
const TZ = "America/Bogota";
const SESSION_HOURS = 8;
const APP_VERSION = "1.3.0";
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
  PushSubscriptions: ['id','scope','userId','cityId','requestId','endpoint','tokenHash','active','createdAt','updatedAt','expiresAt'],
  PushEvents: ['id','createdAt','cityId','requestId','kind','audience','targetId','state','attempts','nextAttemptAt','leaseUntil','leaseToken','lastError'],
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
    if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='deliverPushQueue';}))ScriptApp.newTrigger('deliverPushQueue').timeBased().everyMinutes(1).create();
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
      version: APP_VERSION,
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
  if (action === "installationStatus") return installationStatus_();
  if (!PropertiesService.getScriptProperties().getProperty("PEPPER"))
    fail_("NOT_READY", "Primero ejecuta setup() en Apps Script.");
  if(action==='pushInfo')return pushInfo_();
  if(action==='subscribePush')return subscribePush_(d,session);
  if(action==='pushInbox')return pushInbox_(d);
  if(action==='unsubscribePush')return unsubscribePush_(d);
  if(action==='testPush')return testPush_(d);
  if(action==='dispatchPush')return dispatchPush_(d);
  if (action === "resolveLocation") return resolveMapLocation_(d, true);
  if (action === "searchAddress") return resolveMapLocation_(d, false);
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
  if(action==='configurePush')return configurePush_(actor,d);
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

/** Google Maps integrado en Apps Script. No requiere clave de navegador. */
function resolveMapLocation_(d, reverse) {
  const city = city_(text_(d.cityId, 60, true));
  const input = reverse
    ? location_(Object.assign({}, d, { locationMode: "gps" }), city)
    : null;
  const address = reverse ? "" : text_(d.address, 220, true);
  if (!reverse && address.length < 4)
    fail_("VALIDATION", "Escribe calle, número o nombre del lugar.");
  const key =
    "geocode:" +
    digest_(
      city.id +
        ":" +
        (reverse
          ? input.lat.toFixed(5) + "," + input.lng.toFixed(5)
          : address.toLowerCase()),
    );
  const cached = cache_().get(key);
  if (cached) {
    const value = JSON.parse(cached);
    // Una respuesta de calle en caché nunca sustituye el punto GPS original.
    if (reverse) {
      value.lat = input.lat;
      value.lng = input.lng;
    }
    return value;
  }
  locked_(function () {
    rateUnlocked_("maps-geocode", 60, 60);
    const props = PropertiesService.getScriptProperties(),
      today = day_(now_());
    const calls =
      props.getProperty("mapsDay") === today
        ? Number(props.getProperty("mapsCalls") || 0)
        : 0;
    const limit = Math.max(
      1,
      Number(props.getProperty("MAPS_DAILY_LIMIT")) || 900,
    );
    if (calls >= limit)
      fail_(
        "MAPS_LIMIT",
        "La búsqueda de direcciones está temporalmente ocupada. Puedes confirmar tu GPS o escribir la dirección.",
      );
    props.setProperty("mapsDay", today);
    props.setProperty("mapsCalls", String(calls + 1));
  });
  let response;
  try {
    const geocoder = Maps.newGeocoder()
      .setLanguage("es")
      .setRegion("co")
      .setBounds(
        city.bounds.south,
        city.bounds.west,
        city.bounds.north,
        city.bounds.east,
      );
    response = reverse
      ? geocoder.reverseGeocode(input.lat, input.lng)
      : geocoder.geocode(address + ", " + city.name + ", Colombia");
  } catch (error) {
    fail_(
      "MAPS_UNAVAILABLE",
      "No pudimos obtener la dirección de Google en este momento. Conserva tu GPS o escribe la dirección y una referencia.",
    );
  }
  if (response.status && !["OK", "ZERO_RESULTS"].includes(response.status))
    fail_(
      "MAPS_UNAVAILABLE",
      "La búsqueda de Google no está disponible en este momento. Puedes confirmar tu GPS o escribir la dirección.",
    );
  const matches = (response.results || []).filter(function (result) {
    const components = (result.address_components || []).filter(function (c) {
      return (
        c.types.includes("locality") ||
        c.types.includes("administrative_area_level_2")
      );
    });
    if (
      components.length &&
      !components.some(function (c) {
        return String(c.long_name)
          .toLowerCase()
          .includes(city.name.toLowerCase());
      })
    )
      return false;
    try {
      location_(
        {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          locationMode: "manual_place",
        },
        city,
      );
      return true;
    } catch (error) {
      return false;
    }
  });
  if (!matches.length)
    fail_(
      "ADDRESS_NOT_FOUND",
      "No encontramos una dirección de la zona de " +
        city.name +
        ". Confirma tu punto o añade una referencia.",
    );
  const results = matches.slice(0, 5).map(function (r) {
    return {
      address: String(r.formatted_address).slice(0, 220),
      lat: Number(r.geometry.location.lat),
      lng: Number(r.geometry.location.lng),
    };
  });
  const value = reverse
    ? {
        address: results[0].address,
        lat: input.lat,
        lng: input.lng,
        provider: "Google Maps",
        approximate: true,
      }
    : { results: results, provider: "Google Maps" };
  cache_().put(key, JSON.stringify(value), 1800);
  return value;
}

/** Estado público mínimo: nunca devuelve correos, usuarios ni el código privado. */
function installationStatus_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("PEPPER"))
    return {
      state: "needs_setup",
      bootstrapAvailable: false,
      version: APP_VERSION,
    };
  const book = book_();
  if (
    !Object.keys(SCHEMA).every(function (name) {
      return !!book.getSheetByName(name);
    })
  ) {
    return {
      state: "needs_setup",
      bootstrapAvailable: false,
      version: APP_VERSION,
    };
  }
  const users = sheet_("Users");
  const headers = users.getRange(1, 1, 1, SCHEMA.Users.length).getValues()[0];
  if (
    JSON.stringify(headers) !== JSON.stringify(SCHEMA.Users) ||
    sheet_("Cities").getLastRow() < 2
  ) {
    return {
      state: "needs_setup",
      bootstrapAvailable: false,
      version: APP_VERSION,
    };
  }
  const needsOwner = users.getLastRow() < 2;
  return {
    state: needsOwner ? "needs_owner" : "ready",
    bootstrapAvailable: needsOwner && !!props.getProperty("BOOTSTRAP_TOKEN"),
    version: APP_VERSION,
  };
}

function bootstrap_(d) {
  return locked_(function () {
    if (rows_("Users").length)
      fail_(
        "OWNER_ALREADY_EXISTS",
        "La cuenta inicial ya fue creada. Ingresa con una cuenta registrada.",
      );
    rateUnlocked_("bootstrap", 5, 600);
    const p = PropertiesService.getScriptProperties(),
      expected = p.getProperty("BOOTSTRAP_TOKEN");
    if (!expected || !equal_(String(d.bootstrapToken || ""), expected))
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
    if (!users_().length)
      fail_(
        "OWNER_REQUIRED",
        "Primero debes crear la cuenta del jefe desde este panel.",
      );
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
    return attachPush_(publicOrder_(order),order,'new','admin');
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
      try{enqueuePush_(fresh,'cancelled','client');}catch(error){console.error('Aviso de vencimiento pendiente.');}
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
    if (d.address != null) o.address = text_(d.address, 220, true);
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
    return attachPush_(adminOrder_(o),o,d.status,'client');
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
        try{enqueuePush_(o,'cancelled','client');}catch(error){console.error('Aviso de vencimiento pendiente.');}
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
    cleanupPush_();
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
    "lat",
    "lng",
    "accuracy",
    "locationAt",
    "locationMode",
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
  ["phone", "courierPhone"].forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(o, k))
      o[k] = String(o[k] == null ? "" : o[k]);
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

// BEGIN GENERATED PUSH SERVICE
/** Source included by scripts/build-push-crypto.mjs in the complete Code.gs. */
function pushInfo_() {
  const p = PropertiesService.getScriptProperties();
  const available =
    !!book_().getSheetByName("PushSubscriptions") &&
    !!book_().getSheetByName("PushEvents");
  const publicKey = p.getProperty("PUSH_PUBLIC_KEY") || "";
  return {
    available: available,
    enabled: available && !!publicKey && !!p.getProperty("PUSH_PRIVATE_KEY"),
    publicKey: publicKey,
    version: APP_VERSION,
  };
}
function pushBytes_(text) {
  return Utilities.base64DecodeWebSafe(String(text)).map(function (b) {
    return (b + 256) % 256;
  });
}
function pushB64_(bytes) {
  return Utilities.base64EncodeWebSafe(
    bytes.map(function (b) {
      return b > 127 ? b - 256 : b;
    }),
  ).replace(/=+$/, "");
}
function pushUtf8_(text) {
  return Utilities.newBlob(String(text))
    .getBytes()
    .map(function (b) {
      return (b + 256) % 256;
    });
}
function configurePush_(actor, d) {
  owner_(actor);
  return locked_(function () {
    actor = authenticate_(actor._token);
    owner_(actor);
    if (!pushInfo_().available)
      fail_(
        "PUSH_SETUP_REQUIRED",
        "El servicio de avisos necesita completar su actualización.",
      );
    const p = PropertiesService.getScriptProperties();
    if (p.getProperty("PUSH_PUBLIC_KEY")) return pushInfo_();
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(String(d.privateKey)) ||
      !/^[A-Za-z0-9_-]{87}$/.test(String(d.publicKey))
    )
      fail_(
        "VALIDATION",
        "No pudimos preparar los avisos de este dispositivo.",
      );
    let calculated;
    try {
      calculated = pushB64_(TocPushCrypto.publicKey(pushBytes_(d.privateKey)));
    } catch (error) {
      fail_(
        "VALIDATION",
        "No pudimos preparar los avisos de este dispositivo.",
      );
    }
    if (!equal_(calculated, d.publicKey))
      fail_("VALIDATION", "La configuración de avisos no es válida.");
    p.setProperty("PUSH_PRIVATE_KEY", d.privateKey);
    p.setProperty("PUSH_PUBLIC_KEY", d.publicKey);
    audit_(actor, "PUSH_ENABLED", actor.id);
    return pushInfo_();
  });
}
function pushEndpoint_(endpoint) {
  const text = text_(endpoint, 2048, true),
    match = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^#\s]*)$/i.exec(text);
  if (!match) fail_("VALIDATION", "La dirección de avisos no es válida.");
  const host = match[1].toLowerCase();
  if (!(
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host === "push.services.mozilla.com" ||
    host === "web.push.apple.com" ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(host)
  ))
    fail_(
      "VALIDATION",
      "El proveedor de avisos de este navegador no está habilitado.",
    );
  return { endpoint: text, origin: "https://" + host };
}
function pushPendingCount_(cityId) {
  return cached_(
    "push-count:" + cityId + ":" + revision_(cityId),
    function () {
      return rows_("Requests").filter(function (o) {
        return o.cityId === cityId && o.status === "pending";
      }).length;
    },
    45,
  );
}
function subscribePush_(d, session) {
  if (!pushInfo_().enabled)
    fail_(
      "PUSH_SETUP_REQUIRED",
      "El jefe debe activar primero los avisos del equipo.",
    );
  const target =
    d.scope === "admin" ? authenticate_(session) : authorizeTracking_(d);
  if (d.scope !== "admin" && d.scope !== "client")
    fail_("VALIDATION", "Tipo de aviso no válido.");
  if (d.scope === "admin" && truth_(target.mustChangePassword))
    fail_("PASSWORD_CHANGE_REQUIRED", "Cambia primero tu contraseña inicial.");
  const endpoint = pushEndpoint_(d.endpoint).endpoint;
  return locked_(function () {
    rateUnlocked_("push-subscribe:" + digest_(endpoint), 20, 600);
    // Revalida el permiso tras tomar el bloqueo; no se aceptan roles del navegador.
    const fresh =
      d.scope === "admin"
        ? authenticate_(session)
        : authorizeTracking_(d, true);
    const id = digest_(
      endpoint +
        ":" +
        d.scope +
        ":" +
        (d.scope === "admin" ? fresh.id : "client"),
    );
    let row = rows_("PushSubscriptions").find(function (s) {
      return s.id === id;
    });
    const grant = random_() + random_(),
      now = now_();
    row = Object.assign(row || { id: id, createdAt: now }, {
      scope: d.scope,
      userId: d.scope === "admin" ? fresh.id : "",
      cityId: fresh.cityId,
      requestId: d.scope === "client" ? fresh.id : "",
      endpoint: endpoint,
      tokenHash: digest_(grant),
      active: true,
      updatedAt: now,
      expiresAt: new Date(
        Date.now() + (d.scope === "admin" ? 365 : 30) * 86400000,
      ).toISOString(),
    });
    if (row._row) write_("PushSubscriptions", row);
    else append_("PushSubscriptions", row);
    cache_().remove("push-subscriptions");
    cache_().remove("push-grant:" + id);
    const result = {
      id: id,
      token: grant,
      scope: row.scope,
      requestId: row.requestId,
      userId: row.userId,
      expiresAt: row.expiresAt,
    };
    // Close the race between an order transition and enabling this device.
    const pending = d.scope === "admin" && pushPendingCount_(fresh.cityId) > 0;
    if (pending || (d.scope === "client" && fresh.status !== "pending"))
      result.pushDispatch = enqueuePush_(
        { id: row.requestId, cityId: row.cityId },
        "catchup",
        "subscription",
        row.id,
      );
    return result;
  });
}
function pushGrant_(d) {
  if (
    !/^[a-f0-9]{64}$/.test(String(d.id)) ||
    !/^[a-f0-9]{64}$/.test(String(d.token))
  )
    fail_("UNAUTHORIZED", "Vuelve a activar los avisos en este dispositivo.");
  const row = cached_(
    "push-grant:" + d.id,
    function () {
      return (
        rows_("PushSubscriptions").find(function (s) {
          return s.id === d.id;
        }) || null
      );
    },
    60,
  );
  if (
    !row ||
    !truth_(row.active) ||
    new Date(row.expiresAt).getTime() <= Date.now() ||
    !equal_(row.tokenHash, digest_(d.token))
  )
    fail_("UNAUTHORIZED", "Vuelve a activar los avisos en este dispositivo.");
  if (row.scope === "admin") {
    const u = users_().find(function (u) {
      return u.id === row.userId;
    });
    if (
      !u ||
      !truth_(u.active) ||
      truth_(u.mustChangePassword) ||
      u.cityId !== row.cityId
    )
      fail_("UNAUTHORIZED", "Esta cuenta ya no tiene acceso a los avisos.");
  } else {
    const request = findRequest_(row.requestId);
    if (!request || request.cityId !== row.cityId)
      fail_("UNAUTHORIZED", "Este seguimiento ya no está disponible.");
  }
  return row;
}
function unsubscribePush_(d) {
  return locked_(function () {
    const row = pushGrant_(d);
    row.active = false;
    row.updatedAt = now_();
    write_("PushSubscriptions", row);
    cache_().remove("push-grant:" + row.id);
    cache_().remove("push-subscriptions");
    return { disabled: true };
  });
}
function pushRecentEvents_() {
  const s = sheet_("PushEvents"),
    count = Math.min(500, s.getLastRow() - 1);
  if (count < 1) return [];
  const start = s.getLastRow() - count + 1;
  return s
    .getRange(start, 1, count, SCHEMA.PushEvents.length)
    .getValues()
    .map(function (v, i) {
      return object_("PushEvents", v, start + i);
    });
}
function pushEventMatches_(e, s) {
  return e.audience === "subscription"
    ? e.targetId === s.id
    : e.audience === "admin"
      ? s.scope === "admin" && e.cityId === s.cityId
      : s.scope === "client" && e.requestId === s.requestId;
}
function pushInbox_(d) {
  rate_("push-inbox:" + text_(d.id, 64, true), 40, 60);
  const s = pushGrant_(d),
    since = Number(d.since) || 0;
  const events = pushRecentEvents_()
    .filter(function (e) {
      return (
        pushEventMatches_(e, s) &&
        new Date(e.createdAt).getTime() >= since - 5000
      );
    })
    .slice(-5);
  const notifications = events.map(function (e) {
    if (e.kind === "test")
      return {
        id: e.id,
        title: "TOC TOC está listo",
        body: "Este dispositivo ya puede recibir tus avisos.",
        tag: "toc-test",
        path: s.scope === "admin" ? "admin.html#settings" : "index.html",
      };
    if (s.scope === "admin") {
      const count = pushPendingCount_(s.cityId);
      return {
        id: e.id,
        title: count
          ? "Tienes servicios por aceptar"
          : "Tu centro de servicios está al día",
        body: count
          ? count === 1
            ? "Hay una solicitud esperando. Abre TOC TOC para revisarla."
            : "Hay " +
              count +
              " solicitudes esperando. Abre TOC TOC para revisarlas."
          : "Abre TOC TOC para consultar las últimas novedades.",
        tag: "toc-services-" + s.cityId,
        path: "admin.html#inbox",
      };
    }
    const order = findRequest_(s.requestId);
    const copy = {
      pending: [
        "Recibimos tu solicitud",
        "El equipo está revisando tu servicio.",
      ],
      accepted: [
        "Tu domiciliario está en camino",
        "Tu servicio fue aceptado. Abre TOC TOC para ver sus datos.",
      ],
      completed: [
        "Un pendiente menos",
        "Tu servicio fue marcado como completado.",
      ],
      cancelled: [
        "Tu solicitud fue cancelada",
        "Abre TOC TOC para consultar el estado de tu servicio.",
      ],
    }[order.status] || [
      "Hay novedades de tu servicio",
      "Abre TOC TOC para consultarlas.",
    ];
    return {
      id: e.id + ":" + order.status,
      title: copy[0],
      body: copy[1],
      tag: "toc-request-" + order.id,
      path: "index.html",
    };
  });
  return { notifications: notifications, checkedAt: Date.now() };
}
function enqueuePush_(order, kind, audience, targetId) {
  if (!pushInfo_().enabled) return null;
  const event = {
    id: random_(),
    createdAt: now_(),
    cityId: order.cityId || "",
    requestId: order.id || "",
    kind: kind,
    audience: audience,
    targetId: targetId || "",
    state: "pending",
    attempts: 0,
    nextAttemptAt: now_(),
    leaseUntil: "",
    leaseToken: "",
    lastError: "",
  };
  append_("PushEvents", event);
  PropertiesService.getScriptProperties().setProperty("pushPending", "1");
  const expires = Date.now() + 120000;
  return {
    id: event.id,
    expires: expires,
    token: hmac_("push-dispatch:" + event.id + ":" + expires),
  };
}
function attachPush_(result, order, kind, audience) {
  try {
    const dispatch = enqueuePush_(order, kind, audience);
    if (dispatch) result.pushDispatch = dispatch;
  } catch (error) {
    console.error(
      "No se pudo programar un aviso. El servicio permanece registrado.",
    );
  }
  return result;
}
function testPush_(d) {
  return locked_(function () {
    const s = pushGrant_(d);
    rateUnlocked_("push-test:" + s.id, 3, 60);
    const dispatch = enqueuePush_(
      { id: s.requestId, cityId: s.cityId },
      "test",
      "subscription",
      s.id,
    );
    return { queued: !!dispatch, pushDispatch: dispatch };
  });
}
function pushVapidHeader_(origin) {
  const props = PropertiesService.getScriptProperties(),
    publicKey = props.getProperty("PUSH_PUBLIC_KEY");
  return cached_(
    "vapid:" + digest_(origin + publicKey),
    function () {
      const head = pushB64_(
        pushUtf8_(JSON.stringify({ typ: "JWT", alg: "ES256" })),
      );
      const body = pushB64_(
        pushUtf8_(
          JSON.stringify({
            aud: origin,
            exp: Math.floor(Date.now() / 1000) + 43200,
            sub: "https://devnnex.github.io/TOC-TOC-DOMICILIOS.COM/",
          }),
        ),
      );
      const signature = pushB64_(
        TocPushCrypto.sign(
          pushUtf8_(head + "." + body),
          pushBytes_(props.getProperty("PUSH_PRIVATE_KEY")),
        ),
      );
      return (
        "vapid t=" + head + "." + body + "." + signature + ",k=" + publicKey
      );
    },
    3600,
  );
}
function dispatchPush_(d) {
  const expiry = Number(d.expires);
  if (
    !/^[a-f0-9]{32}$/.test(String(d.id)) ||
    !Number.isFinite(expiry) ||
    expiry < Date.now() ||
    expiry > Date.now() + 125000 ||
    !equal_(String(d.token), hmac_("push-dispatch:" + d.id + ":" + expiry))
  )
    fail_("FORBIDDEN", "El permiso para enviar este aviso ya venció.");
  return deliverPushEvent_(d.id);
}
function deliverPushEvent_(id) {
  const claimed = locked_(function () {
    const e = rows_("PushEvents").find(function (e) {
      return e.id === id;
    });
    if (
      !e ||
      ["sent", "failed", "skipped"].includes(e.state) ||
      new Date(e.nextAttemptAt).getTime() > Date.now() ||
      (e.state === "sending" && new Date(e.leaseUntil).getTime() > Date.now())
    )
      return null;
    e.state = "sending";
    e.leaseUntil = new Date(Date.now() + 60000).toISOString();
    e.leaseToken = random_();
    write_("PushEvents", e);
    return e;
  });
  if (!claimed) return { sent: 0 };
  const enabledUsers = users_(),
    seen = {},
    all = cached_(
      "push-subscriptions",
      function () {
        return rows_("PushSubscriptions");
      },
      60,
    );
  const subscriptions = all.filter(function (s) {
    if (
      !truth_(s.active) ||
      new Date(s.expiresAt).getTime() <= Date.now() ||
      !pushEventMatches_(claimed, s) ||
      seen[s.endpoint]
    )
      return false;
    if (
      s.scope === "admin" &&
      !enabledUsers.some(function (u) {
        return (
          u.id === s.userId &&
          u.cityId === s.cityId &&
          truth_(u.active) &&
          !truth_(u.mustChangePassword)
        );
      })
    )
      return false;
    seen[s.endpoint] = true;
    return true;
  });
  const expired = [],
    failed = [];
  let sent = 0;
  // Payload-less Web Push: the worker reads its scoped inbox over HTTPS.
  for (let i = 0; i < subscriptions.length; i += 100) {
    const batch = subscriptions.slice(i, i + 100);
    try {
      const responses = UrlFetchApp.fetchAll(
        batch.map(function (s) {
          const dest = pushEndpoint_(s.endpoint);
          return {
            url: dest.endpoint,
            method: "post",
            payload: "",
            headers: {
              Authorization: pushVapidHeader_(dest.origin),
              TTL: "86400",
              Urgency: "high",
              Topic: digest_(claimed.audience + claimed.requestId).slice(0, 32),
            },
            muteHttpExceptions: true,
            followRedirects: false,
            validateHttpsCertificates: true,
          };
        }),
      );
      responses.forEach(function (response, index) {
        const code = response.getResponseCode();
        if (code >= 200 && code < 300) sent++;
        else if (code === 404 || code === 410) expired.push(batch[index]);
        else failed.push(String(code));
      });
    } catch (error) {
      failed.push("NETWORK");
    }
  }
  locked_(function () {
    expired.forEach(function (old) {
      const s = rows_("PushSubscriptions").find(function (s) {
        return s.id === old.id;
      });
      if (s && s.updatedAt === old.updatedAt) {
        s.active = false;
        s.updatedAt = now_();
        write_("PushSubscriptions", s);
        cache_().remove("push-grant:" + s.id);
      }
    });
    if (expired.length) cache_().remove("push-subscriptions");
    const e = rows_("PushEvents").find(function (e) {
      return e.id === claimed.id;
    });
    if (!e || e.leaseToken !== claimed.leaseToken) return;
    e.attempts = Number(e.attempts) + 1;
    e.state = failed.length ? (e.attempts >= 6 ? "failed" : "retry") : "sent";
    e.nextAttemptAt = new Date(
      Date.now() + Math.min(900000, 30000 * Math.pow(2, e.attempts)),
    ).toISOString();
    e.lastError = failed.slice(0, 3).join(",");
    e.leaseUntil = "";
    e.leaseToken = "";
    write_("PushEvents", e);
  });
  return { sent: sent, retry: failed.length > 0 };
}
/** Minute trigger is a fallback when a tab closes before dispatching its job. */
function deliverPushQueue() {
  if (
    PropertiesService.getScriptProperties().getProperty("pushPending") !==
      "1" ||
    !pushInfo_().enabled
  )
    return { sent: 0 };
  const pending = rows_("PushEvents").filter(function (e) {
    return ["pending", "retry", "sending"].includes(e.state);
  });
  const due = pending
    .filter(function (e) {
      return (
        new Date(e.nextAttemptAt).getTime() <= Date.now() &&
        (e.state !== "sending" ||
          new Date(e.leaseUntil).getTime() <= Date.now())
      );
    })
    .slice(0, 4);
  let sent = 0;
  due.forEach(function (e) {
    sent += deliverPushEvent_(e.id).sent || 0;
  });
  if (
    !rows_("PushEvents").some(function (e) {
      return ["pending", "retry", "sending"].includes(e.state);
    })
  )
    PropertiesService.getScriptProperties().setProperty("pushPending", "0");
  return { sent: sent };
}
/** Only disposable delivery metadata expires. Never remove business records. */
function cleanupPush_() {
  if (!pushInfo_().available) return;
  const cutoff = Date.now() - 7 * 86400000;
  deleteRows_(
    "PushEvents",
    rows_("PushEvents").filter(function (e) {
      return (
        ["sent", "failed", "skipped"].includes(e.state) &&
        new Date(e.createdAt).getTime() < cutoff
      );
    }),
  );
  const expired = rows_("PushSubscriptions").filter(function (s) {
    return new Date(s.expiresAt).getTime() < cutoff;
  });
  expired.forEach(function (s) {
    cache_().remove("push-grant:" + s.id);
  });
  deleteRows_("PushSubscriptions", expired);
  cache_().remove("push-subscriptions");
}

// END GENERATED PUSH SERVICE

// BEGIN GENERATED PUSH CRYPTO
/*
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
var TocPushCrypto=(()=>{var It=Object.defineProperty;var bn=Object.getOwnPropertyDescriptor;var xn=Object.getOwnPropertyNames;var gn=Object.prototype.hasOwnProperty;var wn=(e,t,r)=>t in e?It(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r;var yn=(e,t)=>{for(var r in t)It(e,r,{get:t[r],enumerable:!0})},mn=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of xn(t))!gn.call(e,o)&&o!==r&&It(e,o,{get:()=>t[o],enumerable:!(n=bn(t,o))||n.enumerable});return e};var En=e=>mn(It({},"__esModule",{value:!0}),e);var b=(e,t,r)=>wn(e,typeof t!="symbol"?t+"":t,r);var nr={};yn(nr,{publicKey:()=>tr,sign:()=>er});var Bn=e=>e/2**32|0,vn=e=>e>>>0;function Be(e,t,r,n){let o=Bn(r),i=vn(r);e.setUint32(t,n?i:o,n),e.setUint32(t+4,n?o:i,n)}function Lt(e){return e instanceof Uint8Array||ArrayBuffer.isView(e)&&e.constructor.name==="Uint8Array"&&"BYTES_PER_ELEMENT"in e&&e.BYTES_PER_ELEMENT===1}var Kt=e=>e?`"${e}" `:"";function X(e,t=""){if(typeof e!="number")throw new TypeError(Kt(t)+"expected number, got "+typeof e);if(!Number.isSafeInteger(e)||e<0)throw new RangeError(Kt(t)+"expected integer >= 0, got "+e);return e}function Y(e,t,r=""){if(Lt(e)&&(t===void 0||e.length===t))return e;t!==void 0&&X(t,"length");let n=Lt(e),o=t!==void 0?` of length ${t}`:"",i=n?`length=${e.length}`:`type=${typeof e}`,f=Kt(r)+"expected Uint8Array"+o+", got "+i;throw n?new RangeError(f):new TypeError(f)}function Ft(e){if(typeof e!="function"||typeof e.create!="function")throw new TypeError("expected hash wrapped by utils.createHasher");if(X(e.outputLen),X(e.blockLen),e.outputLen<1||e.blockLen<1)throw new Error("hash blockLen / outputLen must be >= 1")}var Sn=(e,t)=>{if(e===null||typeof e!="object"||Array.isArray(e))throw new TypeError((t==="object"?"":`"${t}" `)+"expected object, got type="+typeof e)},ve=(e,t)=>{Sn(e,t);let r=Object.getPrototypeOf(e);if(r!==Object.prototype&&r!==null)throw new TypeError(`"${t}" expected plain object`);if(Object.hasOwn(e,"__proto__"))throw new TypeError(`"${t}.__proto__" is not allowed`)};function bt(e,t=!0){if(e.destroyed)throw new Error("hash was destroyed");if(t&&e.finished)throw new Error("digest() was already called")}function Dt(e,t){Y(e,void 0,"output");let r=t.outputLen;if(!(e.length>=r))throw new RangeError('"output" expected length >= '+r)}function vt(...e){for(let t=0;t<e.length;t++)e[t].fill(0)}function Ut(e){return new DataView(e.buffer,e.byteOffset,e.byteLength)}function $(e,t){return e<<32-t|e>>>t}var Re=typeof Uint8Array.from([]).toHex=="function"&&typeof Uint8Array.fromHex=="function",Rn=Array.from({length:256},(e,t)=>t.toString(16).padStart(2,"0"));function Nt(e){if(Y(e),Re)return e.toHex();let t="";for(let r=0;r<e.length;r++)t+=Rn[e[r]];return t}function Se(e){return e>=48&&e<=57?e-48:e>=65&&e<=70?e-55:e>=97&&e<=102?e-87:void 0}function Qt(e){if(typeof e!="string")throw new TypeError("hex string expected, got "+typeof e);if(Re)try{return Uint8Array.fromHex(e)}catch(o){throw o instanceof SyntaxError?new RangeError(o.message):o}let t=e.length,r=t/2;if(t%2)throw new RangeError("hex string expected, got unpadded hex of length "+t);let n=new Uint8Array(r);for(let o=0,i=0;o<r;o++,i+=2){let f=Se(e.charCodeAt(i)),c=Se(e.charCodeAt(i+1));if(f===void 0||c===void 0){let s=e[i]+e[i+1];throw new RangeError('hex string expected, got non-hex character "'+s+'" at index '+i)}n[o]=f*16+c}return n}function Oe(...e){let t=0;for(let n=0;n<e.length;n++){let o=e[n];Y(o),t+=o.length}let r=new Uint8Array(t);for(let n=0,o=0;n<e.length;n++){let i=e[n];r.set(i,o),o+=i.length}return r}function On(e,t,r="opts"){return ve(e,"defaults"),t!==void 0&&ve(t,r),Object.assign(Object.create(null),e,t)}function Te(e,t={}){if(typeof e!="function")throw new TypeError('"hashCons" expected function, got type='+typeof e);t=On({},t,"info");let r=(o,i)=>e(i).update(o).digest(),n=e(void 0);return r.outputLen=n.outputLen,r.blockLen=n.blockLen,r.canXOF=n.canXOF,r.create=o=>e(o),Object.assign(r,t),Object.freeze(r)}function Ae(e=32){X(e,"bytesLength");let t=typeof globalThis=="object"?globalThis.crypto:null;if(typeof t?.getRandomValues!="function")throw new Error("crypto.getRandomValues must be defined");if(e>65536)throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);return t.getRandomValues(new Uint8Array(e))}var _e=e=>({oid:Uint8Array.from([6,9,96,134,72,1,101,3,4,2,e])});function He(e,t,r){return e&t^~e&r}function Ie(e,t,r){return e&t^e&r^t&r}var qt=class{constructor(t,r,n,o){b(this,"blockLen");b(this,"outputLen");b(this,"canXOF",!1);b(this,"padOffset");b(this,"isLE");b(this,"buffer");b(this,"view");b(this,"finished",!1);b(this,"length",0);b(this,"pos",0);b(this,"destroyed",!1);this.blockLen=t,this.outputLen=r,this.padOffset=n,this.isLE=o,this.buffer=new Uint8Array(t),this.view=Ut(this.buffer)}update(t){bt(this),Y(t);let{view:r,buffer:n,blockLen:o}=this,i=t.length,f=!1;for(let c=0;c<i;){let s=Math.min(o-this.pos,i-c);if(s===o){let a=Ut(t);for(;o<=i-c;c+=o)this.process(a,c);f=!0;continue}n.set(c===0&&s===i?t:t.subarray(c,c+s),this.pos),this.pos+=s,c+=s,this.pos===o&&(this.process(r,0),this.pos=0,f=!0)}return this.length+=t.length,f&&this.roundClean(),this}digestInto(t){bt(this),Dt(t,this),this.finished=!0;let{buffer:r,view:n,blockLen:o,isLE:i}=this,{pos:f}=this;r[f++]=128,r.fill(0,f),this.padOffset>o-f&&(this.process(n,0),r.fill(0)),Be(n,o-8,this.length*8,i),this.process(n,0),this.roundClean();let c=t===r?n:Ut(t),s=this.outputLen,a=s/4,l=this.get();if(s%4||a>l.length)throw new Error("invalid outputLen");for(let B=0;B<a;B++)c.setUint32(4*B,l[B],i)}digest(){let{buffer:t,outputLen:r}=this;this.digestInto(t);let n=t.slice(0,r);return this.destroy(),n}_cloneIntoMeta(t){let{buffer:r,length:n,finished:o,destroyed:i,pos:f}=this;return t.destroyed=i,t.finished=o,t.length=n,t.pos=f,f&&t.buffer.set(r),t}clone(){return this._cloneInto()}},Le=Uint32Array.from([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]);var Tn=Uint32Array.from([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]),tt=new Uint32Array(64),Jt=class extends qt{constructor(r,n){super(64,r,8,!1);b(this,"A",0);b(this,"B",0);b(this,"C",0);b(this,"D",0);b(this,"E",0);b(this,"F",0);b(this,"G",0);b(this,"H",0);this.A=n[0]|0,this.B=n[1]|0,this.C=n[2]|0,this.D=n[3]|0,this.E=n[4]|0,this.F=n[5]|0,this.G=n[6]|0,this.H=n[7]|0}get(){let{A:r,B:n,C:o,D:i,E:f,F:c,G:s,H:a}=this;return[r,n,o,i,f,c,s,a]}set(r,n,o,i,f,c,s,a){this.A=r|0,this.B=n|0,this.C=o|0,this.D=i|0,this.E=f|0,this.F=c|0,this.G=s|0,this.H=a|0}_cloneInto(r){return(r||(r=new this.constructor)).set(...this.get()),this._cloneIntoMeta(r)}process(r,n){for(let m=0;m<16;m++,n+=4)tt[m]=r.getUint32(n,!1);for(let m=16;m<64;m++){let y=tt[m-15],O=tt[m-2],H=$(y,7)^$(y,18)^y>>>3,R=$(O,17)^$(O,19)^O>>>10;tt[m]=R+tt[m-7]+H+tt[m-16]|0}let{A:o,B:i,C:f,D:c,E:s,F:a,G:l,H:B}=this;for(let m=0;m<64;m++){let y=$(s,6)^$(s,11)^$(s,25),O=B+y+He(s,a,l)+Tn[m]+tt[m]|0,R=($(o,2)^$(o,13)^$(o,22))+Ie(o,i,f)|0;B=l,l=a,a=s,s=c+O|0,c=f,f=i,i=o,o=O+R|0}o=o+this.A|0,i=i+this.B|0,f=f+this.C|0,c=c+this.D|0,s=s+this.E|0,a=a+this.F|0,l=l+this.G|0,B=B+this.H|0,this.set(o,i,f,c,s,a,l,B)}roundClean(){vt(tt)}destroy(){this.destroyed=!0,this.set(0,0,0,0,0,0,0,0),vt(this.buffer)}},te=class extends Jt{constructor(){super(32,Le)}};var Fe=Te(()=>new te,_e(1));/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */function jt(e,t,r=()=>{}){if(!Array.isArray(e))throw new TypeError(`"${t}" expected array, got type=${typeof e}`);for(let n=0;n<e.length;n++)r(e[n],`${t}[${n}]`);return e}var N=(e,t,r)=>Y(e,t,r),ee=X;function Ue(e,t=""){if(typeof e!="string"){let r=t&&`"${t}" `;throw new TypeError(r+"expected string, got type="+typeof e)}return e}function et(e,t="object"){if(e===null||typeof e!="object"||Array.isArray(e))throw new TypeError(t==="object"?"expected valid options object":`"${t}" expected object, got type=${typeof e}`);return e}function ct(e,t){if(typeof e!="function")throw new TypeError(`"${t}" is invalid: expected function, got ${typeof e}`);return e}var ne=Nt,V=(...e)=>Oe(...e),Mt=e=>Qt(e),xt=Lt,Zt=e=>Ae(e),Ct=BigInt(0),De=BigInt(1),An=e=>e?`"${e}" `:"";function z(e,t=""){if(typeof e!="boolean")throw new TypeError(An(t)+"expected boolean, got type="+typeof e);return e}function kt(e){if(typeof e=="bigint"){if(!nt(e))throw new RangeError("positive bigint expected, got "+e)}else ee(e);return e}function at(e,t=""){if(typeof e!="number"){let r=t&&`"${t}" `;throw new TypeError(r+"expected number, got type="+typeof e)}if(!Number.isSafeInteger(e)){let r=t&&`"${t}" `;throw new RangeError(r+"expected safe integer, got "+e)}}function St(e){let t=kt(e).toString(16);return t.length&1?"0"+t:t}function Ne(e){if(typeof e!="string")throw new TypeError("hex string expected, got "+typeof e);return e===""?Ct:BigInt("0x"+e)}function W(e){return Ne(Nt(e))}function re(e){return Ne(Nt(_n(Y(e)).reverse()))}function Pt(e,t){if(X(t),t===0)throw new Error("zero output length is invalid");e=kt(e);let r=t*2,n=e.toString(16);if(n.length>r)throw new RangeError("number is too large");return Qt(n.padStart(r,"0"))}function oe(e,t){return Pt(e,t).reverse()}function _n(e){return Uint8Array.from(N(e))}function nt(e){return typeof e=="bigint"&&Ct<=e}function ie(e,t,r){return nt(e)&&nt(t)&&nt(r)&&t<=e&&e<r}function se(e,t,r,n){if(!ie(t,r,n))throw new RangeError("expected valid "+e+": "+r+" <= n < "+n+", got "+t)}function gt(e){if(e<Ct)throw new Error("expected non-negative bigint, got "+e);return e===Ct?0:e.toString(2).length}var Rt=e=>(at(e,"n"),(De<<BigInt(e))-De);function qe(e,t,r){if(X(e,"hashLen"),X(t,"qByteLen"),typeof r!="function")throw new TypeError("hmacFn must be a function");let n=R=>new Uint8Array(R),o=Uint8Array.of(),i=Uint8Array.of(0),f=Uint8Array.of(1),c=1e3,s=n(e),a=n(e),l=0,B=()=>{s.fill(1),a.fill(0),l=0},m=(...R)=>r(a,V(s,...R)),y=(R=o)=>{a=m(i,R),s=m(),R.length!==0&&(a=m(f,R),s=m())},O=()=>{if(l++>=c)throw new Error("drbg: tried max amount of iterations");let R=0,I=[];for(;R<t;){s=m();let D=s.slice();I.push(D),R+=s.length}return V(...I)};return(R,I)=>{B(),y(R);let D;for(;(D=I(O()))===void 0;)y();return B(),D}}function rt(e,t={},r={},n="object"){et(e,n),et(t,"fields"),et(r,"optFields");function o(f,c,s){let a=n==="object"?`param "${String(f)}"`:`"${n}.${String(f)}"`,l=e[f];if(!Object.hasOwn(e,f)&&(s?l!==void 0:c!=="function"))throw new TypeError(`${a} is invalid: expected own property`);if(s&&l===void 0)return;let B=typeof l;if(B!==c||l===null)throw new TypeError(`${a} is invalid: expected ${c}, got ${B}`)}let i=(f,c)=>Object.entries(f).forEach(([s,a])=>o(s,a,c));i(t,!1),i(r,!0)}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var C=BigInt(0),_=BigInt(1),ot=BigInt(2),Ze=BigInt(3),fe=BigInt(4),ke=BigInt(5),Hn=BigInt(7),Pe=BigInt(8),In=BigInt(9),Ln=BigInt(15),$e=BigInt(16),Fn=BigInt("0x10000000000000000");function k(e,t){if(t<=C)throw new Error("mod: expected positive modulus, got "+t);let r=e%t;return r>=C?r:t+r}function Ye(e,t,r){if(r<=_)throw new Error("pow: expected modulus > 1, got "+r);if(typeof t!="bigint")throw new TypeError("invalid exponent: expected bigint, got "+typeof t);if(t<C)throw new Error("invalid exponent, negatives unsupported");if(t===C)return _;if(t===_)return e;let n=e%r;if(n<C&&(n+=r),t<Fn){let c=_;for(;t>C;)t&_&&(c=c*n%r),n=n*n%r,t>>=_;return c}let o=[];for(;t>C;)o.push(Number(t&Ln)),t>>=fe;let i=new Array(16);i[0]=_,i[1]=n;for(let c=2;c<16;c++)i[c]=i[c-1]*n%r;let f=i[o[o.length-1]];for(let c=o.length-2;c>=0;c--){f=f*f%r,f=f*f%r,f=f*f%r,f=f*f%r;let s=o[c];s!==0&&(f=f*i[s]%r)}return f}function Ce(e,t){if(e===C)throw new Error("invert: expected non-zero number");if(t<=_)throw new Error("invert: expected modulus > 1, got "+t);let r=k(e,t),n=t,o=C,i=_;for(;r!==C;){let c=n/r,s=n-r*c,a=o-i*c;n=r,r=s,o=i,i=a}if(n!==_)throw new Error("invert: does not exist");return k(o,t)}function ze(e,t){if(t<=_)throw new Error("invertCt: expected prime modulus > 1, got "+t);let r=k(e,t);if(r===C)throw new Error("invertCt: expected non-zero number");let n=Ye(r,t-ot,t);if(k(r*n,t)!==_)throw new Error("invertCt: does not exist");return n}function ce(e,t,r){let n=e;if(!n.eql(n.sqr(t),r))throw new Error("Cannot find square root")}function ae(e,t){if((e&_)===C)throw new Error(t+": expected odd modulus, got "+e)}function We(e,t){let r=e,n=(r.ORDER+_)/fe,o=r.pow(t,n);return ce(r,o,t),o}function Dn(e,t){let r=e,n=(r.ORDER-ke)/Pe,o=r.mul(t,ot),i=r.pow(o,n),f=r.mul(t,i),c=r.mul(r.mul(f,ot),i),s=r.mul(f,r.sub(c,r.ONE));return ce(r,s,t),s}function Un(e){let t=Yt(e),r=Ge(e),n=r(t,t.neg(t.ONE)),o=r(t,n),i=r(t,t.neg(n)),f=(e+Hn)/$e;return((c,s)=>{let a=c,l=a.pow(s,f),B=a.mul(l,n),m=a.mul(l,o),y=a.mul(l,i),O=a.eql(a.sqr(B),s),H=a.eql(a.sqr(m),s);l=a.cmov(l,B,O),B=a.cmov(y,m,H);let R=a.eql(a.sqr(B),s),I=a.cmov(l,B,R);return ce(a,I,s),I})}function Ge(e){if(e<Ze)throw new Error("sqrt is not defined for small field");ae(e,"tonelliShanks");let t=e-_,r=0;for(;t%ot===C;)t/=ot,r++;let n=ot,o=Yt(e);for(;je(o,n)===1;)if(n++>1e3)throw new Error("Cannot find square root: probably non-prime P");if(r===1)return We;let i=o.pow(n,t),f=(t+_)/ot;return function(s,a){let l=s;if(l.is0(a))return a;if(je(l,a)!==1)throw new Error("Cannot find square root");let B=r,m=l.mul(l.ONE,i),y=l.pow(a,t),O=l.pow(a,f);for(;!l.eql(y,l.ONE);){if(l.is0(y))throw new Error("Cannot find square root: probably non-prime P");let H=1,R=l.sqr(y);for(;!l.eql(R,l.ONE);)if(H++,R=l.sqr(R),H===B)throw new Error("Cannot find square root");let I=_<<BigInt(B-H-1),D=l.pow(m,I);B=H,m=l.sqr(D),y=l.mul(y,m),O=l.mul(O,D)}return O}}function Nn(e){return ae(e,"Fp.sqrt"),e%fe===Ze?We:e%Pe===ke?Dn:e%$e===In?Un(e):Ge(e)}var qn=["create","isValid","is0","neg","inv","sqrt","sqr","eql","add","sub","mul","pow","div","addN","subN","mulN","sqrN"];function wt(e){if(et(e,"field"),typeof e.ORDER!="bigint")throw new TypeError('param "ORDER" is invalid: expected bigint, got '+typeof e.ORDER);at(e.BYTES,"BYTES"),at(e.BITS,"BITS");for(let t of qn)ct(e[t],"field."+t);if(e.BYTES<1||e.BITS<1)throw new Error("invalid field: expected BYTES/BITS > 0");if(e.ORDER<=_)throw new Error("invalid field: expected ORDER > 1, got "+e.ORDER);return e}function de(e,t,r=!1){wt(e),jt(t,"nums"),z(r,"passZero");let n=e,o=new Array(t.length).fill(r?n.ZERO:void 0),i=t.reduce((c,s,a)=>n.is0(s)?c:(o[a]=c,n.mul(c,s)),n.ONE),f=n.inv(i);return t.reduceRight((c,s,a)=>n.is0(s)?c:(o[a]=n.mul(c,o[a]),n.mul(c,s)),f),o}function je(e,t){wt(e);let r=e;ae(r.ORDER,"FpLegendre");let n=(r.ORDER-_)/ot,o=r.pow(t,n),i=r.eql(o,r.ONE),f=r.eql(o,r.ZERO),c=r.eql(o,r.neg(r.ONE));if(!i&&!f&&!c)throw new Error("invalid Legendre symbol result");return i?1:f?0:-1}function Cn(e,t){if(t!==void 0&&ee(t),e<=C)throw new Error("invalid n length: expected positive n, got "+e);if(t!==void 0&&t<1)throw new Error("invalid n length: expected positive bit length, got "+t);let r=gt(e);if(t!==void 0&&t<r)throw new Error(`invalid n length: expected nBitLength (${t}) >= bitLen(n) (${r})`);let n=t!==void 0?t:r,o=Math.ceil(n/8);return{nBitLength:n,nByteLength:o}}var Me=new WeakMap,$t=class{constructor(t,r={}){b(this,"ORDER");b(this,"BITS");b(this,"BYTES");b(this,"isLE");b(this,"ZERO",C);b(this,"ONE",_);b(this,"_lengths");b(this,"_mod");if(t<=_)throw new Error("invalid field: expected ORDER > 1, got "+t);let n;this.isLE=!1,r!=null&&typeof r=="object"&&(typeof r.BITS=="number"&&(n=r.BITS),typeof r.sqrt=="function"&&Object.defineProperty(this,"sqrt",{value:r.sqrt,enumerable:!0}),typeof r.isLE=="boolean"&&(this.isLE=r.isLE),r.allowedLengths&&(this._lengths=Object.freeze(r.allowedLengths.slice())),typeof r.modFromBytes=="boolean"&&(this._mod=r.modFromBytes));let{nBitLength:o,nByteLength:i}=Cn(t,n);if(i>2048)throw new Error("invalid field: expected ORDER of <= 2048 bytes");this.ORDER=t,this.BITS=o,this.BYTES=i,Object.freeze(this)}create(t){return k(t,this.ORDER)}isValid(t){if(typeof t!="bigint")throw new TypeError("invalid field element: expected bigint, got "+typeof t);return C<=t&&t<this.ORDER}is0(t){return t===C}isValidNot0(t){return!this.is0(t)&&this.isValid(t)}isOdd(t){return(t&_)===_}neg(t){return k(-t,this.ORDER)}eql(t,r){return t===r}sqr(t){return k(t*t,this.ORDER)}add(t,r){return k(t+r,this.ORDER)}sub(t,r){return k(t-r,this.ORDER)}mul(t,r){return k(t*r,this.ORDER)}pow(t,r){return Ye(t,r,this.ORDER)}div(t,r){return k(t*Ce(r,this.ORDER),this.ORDER)}sqrN(t){return t*t}addN(t,r){return t+r}subN(t,r){return t-r}mulN(t,r){return t*r}inv(t){return Ce(t,this.ORDER)}sqrt(t){let r=Me.get(this);return r||Me.set(this,r=Nn(this.ORDER)),r(this,t)}toBytes(t){return this.isLE?oe(t,this.BYTES):Pt(t,this.BYTES)}fromBytes(t,r=!1){N(t);let{_lengths:n,BYTES:o,isLE:i,ORDER:f,_mod:c}=this;if(n){if(t.length<1||!n.includes(t.length)||t.length>o)throw new Error("Field.fromBytes: expected "+n+" bytes, got "+t.length);let a=new Uint8Array(o);a.set(t,i?0:a.length-t.length),t=a}if(t.length!==o)throw new Error("Field.fromBytes: expected "+o+" bytes, got "+t.length);let s=i?re(t):W(t);if(c&&(s=k(s,f)),!r&&!this.isValid(s))throw new Error("invalid field element: outside of range 0..ORDER");return s}invertBatch(t){return de(this,t,!0)}cmov(t,r,n){return z(n,"condition"),n?r:t}};function Yt(e,t={}){return Object.freeze($t.prototype),new $t(e,t)}function Xe(e){if(typeof e!="bigint")throw new Error("field order must be bigint");if(e<=_)throw new Error("field order must be greater than 1");let t=gt(e-_);return Math.ceil(t/8)}function zt(e){let t=Xe(e);return t+Math.ceil(t/2)}function ue(e,t,r=!1){N(e);let n=e.length,o=Xe(t),i=Math.max(zt(t),16);if(n<i||n>1024)throw new Error("expected "+i+"-1024 bytes of input, got "+n);let f=r?re(e):W(e),c=k(f,t-_)+_;return r?oe(c,o):Pt(c,o)}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var pe=BigInt(0),Ot=BigInt(1),jn=BigInt(4),le=16,Ve=128,Mn=5,Ke=2**31;function yt(e){let t=e;if(typeof t!="function")throw new TypeError('"Point" expected constructor, got type='+typeof e);ct(t.fromAffine,"Point.fromAffine"),ct(t.fromBytes,"Point.fromBytes"),ct(t.fromHex,"Point.fromHex"),et(t.BASE,"Point.BASE"),et(t.ZERO,"Point.ZERO"),wt(t.Fp),wt(t.Fn)}function Je(e,t){yt(e),tn(t,e);let r=de(e.Fp,t.map(n=>n.Z));return t.map((n,o)=>e.fromAffine(n.toAffine(r[o])))}function Zn(e,t,r=1){if(!Number.isSafeInteger(e)||e<r||e>t)throw new Error("invalid window size, expected ["+r+".."+t+"], got W="+e)}function kn(e,t){let r=e*(4*t+128);if(r>Ke)throw new Error("invalid window size: table would need ~"+Math.ceil(r/2**20)+" MiB, max "+Ke/2**20+" MiB")}function be(e,t){if(e!==void 0){ct(e,"randomBytes");try{let r=e(t);if(!xt(r)||r.length!==t)return}catch{return}return e}}function tn(e,t){jt(e,"points"),e.forEach((r,n)=>{if(!(r instanceof t))throw new Error("invalid point at index "+n)})}function Pn(e,t,r){if(!Array.isArray(e))throw new Error("array of scalars expected");e.forEach((n,o)=>{if(!(r===void 0?t.isValid(n):nt(n)&&n<r))throw new Error("invalid scalar at index "+o)})}var en=new WeakMap;function he(e){return en.get(e)||1}function $n(e,t){let r=e.double(),n=[e];for(let o=1;o<t;o++)n.push(n[o-1].add(r));return n}function Yn(e,t){let r=2**t,n=r/2,o=BigInt(r-1),i=[];for(;e>pe;){let f=0;e&Ot&&(f=Number(e&o),f>=n&&(f-=r),e-=BigInt(f)),i.push(f),e>>=Ot}return i}function zn(e,t,r){let n=2**t,o=n/2,i=BigInt(n-1),f=BigInt(t),c=[];for(let s=0;s<r;s++){let a=Number(e&i);e>>=f,a>o&&(a-=n,e+=Ot),c.push(a)}if(e!==pe)throw new Error("invalid wnaf");return c}function Wn(e,t,r){let n=0;for(let i of r)n=Math.max(n,i.length);let o=e;for(let i=n-1;i>=0;i--){i!==n-1&&(o=o.double());for(let f=0;f<r.length;f++){let c=r[f][i];if(c){let s=t[f][Math.abs(c)-1>>1];o=o.add(c<0?s.negate():s)}}}return o}var Wt=class{constructor(t,r){b(this,"Point");b(this,"BASE");b(this,"ZERO");b(this,"randomBytes");b(this,"wnafPrecomputes",new WeakMap);b(this,"baseCanBeBlinded");b(this,"bits");yt(t),this.randomBytes=be(r,le),this.Point=t,this.BASE=t.BASE,this.ZERO=t.ZERO,this.bits=t.Fn.BITS}buildWnafTable(t,r,n){let o=Math.ceil(n/r)+1,i=2**(r-1),f=[],c=t;for(let s=0;s<o;s++){let a=c;for(let l=0;l<i;l++)f.push(a),a=a.add(c);c=f[f.length-1].double()}return{W:r,bits:n,windows:o,comp:f}}wnafCachedCT(t,r){let{W:n,windows:o,comp:i}=t,f=2**(n-1),c=zn(r,n,o),s=this.ZERO,a=this.BASE;for(let l=0;l<o;l++){let B=c[l],m=l*f,y=Math.abs(B)-1,O=i[m];for(let R=1;R<f;R++)O=R===y?i[m+R]:O;let H=O.negate();B===0?a=a.add(i[m]):s=s.add(B<0?H:O)}return{p:s,f:a}}getWnafPrecomputes(t,r,n,o){let i=this.wnafPrecomputes.get(r),f=i?.find(c=>c.W===t&&c.bits===n);return f||(f=this.buildWnafTable(r,t,n),typeof o=="function"&&(f={...f,comp:o(f.comp)}),i||(i=[],this.wnafPrecomputes.set(r,i)),i.push(f)),f}assertPoint(t){if(!(t instanceof this.Point))throw new TypeError('"point" expected Point instance, got type='+typeof t)}validateMulInput(t,r){if(this.assertPoint(t),!ie(r,Ot,this.Point.Fn.ORDER))throw new Error("invalid scalar")}runCT(t,r,n,o){let i=he(t);return i===1?this.fixedWindowCT(t,r,n):this.wnafCachedCT(this.getWnafPrecomputes(i,t,n,o),r)}mulCT(t,r,n){return this.validateMulInput(t,r),this.runCT(t,r,this.bits,n)}mulCTBlinded(t,r,n){if(this.validateMulInput(t,r),this.randomBytes===void 0)throw new Error("randomBytes is required for scalar blinding");let o=this.Point.Fn.BITS+Ve,i=this.randomBytes(le);if(!xt(i)||i.length!==le)throw new Error("randomBytes returned invalid byte array");i[0]=i[0]&63|128;let f=r+W(i)*this.Point.Fn.ORDER;return this.runCT(t,f,o,n)}fixedWindowCT(t,r,n){let o=Mn,i=1<<o,f=Rt(o),c=new Array(i);c[0]=this.ZERO;for(let l=1;l<i;l++)c[l]=c[l-1].add(t);let s=Math.ceil(n/o),a=this.ZERO;for(let l=s-1;l>=0;l--){if(l!==s-1)for(let y=0;y<o;y++)a=a.double();let B=Number(r>>BigInt(l*o)&f),m=c[0];for(let y=1;y<i;y++)m=y===B?c[y]:m;a=a.add(m)}return{p:a,f:a}}shouldBlind(t,r){return this.randomBytes===void 0?!1:r===Ot?!0:t!==this.BASE?!1:(this.baseCanBeBlinded===void 0&&(this.baseCanBeBlinded=this.mulUnsafe(this.BASE,this.Point.Fn.ORDER).is0()),this.baseCanBeBlinded)}mulSecret(t,r,n,o){return this.shouldBlind(t,n)?this.mulCTBlinded(t,r,o):this.mulCT(t,r,o)}mulUnsafe(t,r,n){if(this.assertPoint(t),!nt(r))throw new Error("invalid scalar");let o=he(t);if(o===1||r>=this.Point.Fn.ORDER)return Gt(this.Point,[t],[r],!0);let i=this.getWnafPrecomputes(o,t,this.bits,n);return this.wnafCachedCT(i,r).p}setWindowSize(t,r){this.assertPoint(t),Zn(r,this.bits);let n=Math.ceil((this.bits+Ve)/r)+1;kn(n*2**(r-1),this.Point.Fp.BYTES),en.set(t,r),this.wnafPrecomputes.delete(t)}hasWindowSize(t){return he(t)!==1}};function Gt(e,t,r,n=!1){if(yt(e),tn(t,e),z(n,"allowOversized"),Pn(r,e.Fn,n?e.Fn.ORDER**jn:void 0),t.length!==r.length)throw new Error("arrays of points and scalars must have equal length");let o=t.map(f=>$n(f,4)),i=r.map(f=>Yn(f,4));return Wn(e.ZERO,o,i)}function Qe(e,t,r){if(t){if(t.ORDER!==e)throw new Error("Field.ORDER must match order: Fp == p, Fn == n");return wt(t),t}else return Yt(e,{isLE:r})}function nn(e,t,r={},n){if(e!=="weierstrass"&&e!=="edwards")throw new Error('expected curve type "weierstrass" or "edwards"');if(n===void 0&&(n=e==="edwards"),!t||typeof t!="object")throw new Error(`expected valid ${e} CURVE object`);rt(r);for(let s of["p","n","h"]){let a=t[s];if(!(nt(a)&&a!==pe))throw new Error(`CURVE.${s} must be positive bigint`)}let o=Qe(t.p,r.Fp,n),i=Qe(t.n,r.Fn,n),c=["Gx","Gy","a",e==="weierstrass"?"b":"d"];for(let s of c)if(!o.isValid(t[s]))throw new Error(`CURVE.${s} must be valid field element of CURVE.Fp`);return t=Object.freeze(Object.assign({},t)),{CURVE:t,Fp:o,Fn:i}}function rn(e,t){return function(n){let o=e(n);return{secretKey:o,publicKey:t(o)}}}var Xt=class{constructor(t,r){b(this,"oHash");b(this,"iHash");b(this,"blockLen");b(this,"outputLen");b(this,"canXOF",!1);b(this,"finished",!1);b(this,"destroyed",!1);if(Ft(t),Y(r,void 0,"key"),this.iHash=t.create(),typeof this.iHash.update!="function")throw new Error("expected Hash instance");this.blockLen=this.iHash.blockLen,this.outputLen=this.iHash.outputLen;let n=this.blockLen,o=new Uint8Array(n);o.set(r.length>n?t.create().update(r).digest():r);for(let i=0;i<o.length;i++)o[i]^=54;this.iHash.update(o),this.oHash=t.create();for(let i=0;i<o.length;i++)o[i]^=106;this.oHash.update(o),vt(o)}update(t){return bt(this),this.iHash.update(t),this}digestInto(t){bt(this),Dt(t,this),this.finished=!0;let r=t.subarray(0,this.outputLen);this.iHash.digestInto(r),this.oHash.update(r),this.oHash.digestInto(r),this.destroy()}digest(){let t=new Uint8Array(this.oHash.outputLen);return this.digestInto(t),t}_cloneInto(t){t||(t=Object.create(Object.getPrototypeOf(this),{}));let{oHash:r,iHash:n,finished:o,destroyed:i,blockLen:f,outputLen:c,canXOF:s}=this;return t=t,t.finished=o,t.destroyed=i,t.blockLen=f,t.outputLen=c,t.canXOF=s,t.oHash=r._cloneInto(t.oHash),t.iHash=n._cloneInto(t.iHash),t}clone(){return this._cloneInto()}destroy(){this.destroyed=!0,this.oHash.destroy(),this.iHash.destroy()}},on=(()=>{let e=((t,r,n)=>new Xt(t,r).update(n).digest());return e.create=(t,r)=>new Xt(t,r),e})();/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var Gn=BigInt(0),xe=class extends Error{constructor(t=""){super(t)}},K={Err:xe,_tlv:{encode:(e,t)=>{let{Err:r}=K;if(at(e,"tag"),e<0||e>255)throw new r("tlv.encode: wrong tag");if(Ue(t,"data"),t.length&1)throw new r("tlv.encode: unpadded data");let n=t.length/2,o=St(n);if(o.length/2&128)throw new r("tlv.encode: long form length too big");let i=n>127?St(o.length/2|128):"";return St(e)+i+o+t},decode(e,t){let{Err:r}=K;t=N(t,void 0,"DER data");let n=0;if(e<0||e>255)throw new r("tlv.decode: wrong tag");if(t.length<2||t[n++]!==e)throw new r("tlv.decode: wrong tlv");let o=t[n++],i=!!(o&128),f=0;if(!i)f=o;else{let s=o&127;if(!s)throw new r("tlv.decode(long): indefinite length not supported");if(s>4)throw new r("tlv.decode(long): byte length is too big");let a=t.subarray(n,n+s);if(a.length!==s)throw new r("tlv.decode: length bytes not complete");if(a[0]===0)throw new r("tlv.decode(long): zero leftmost byte");for(let l of a)f=f<<8|l;if(n+=s,f<128)throw new r("tlv.decode(long): not minimal encoding")}let c=t.subarray(n,n+f);if(c.length!==f)throw new r("tlv.decode: wrong value length");return{v:c,l:t.subarray(n+f)}}},_int:{encode(e){let{Err:t}=K;if(kt(e),e<Gn)throw new t("integer: negative integers are not allowed");let r=St(e);if(Number.parseInt(r[0],16)&8&&(r="00"+r),r.length&1)throw new t("unexpected DER parsing assertion: unpadded hex");return r},decode(e){let{Err:t}=K;if(e.length<1)throw new t("invalid signature integer: empty");if(e[0]&128)throw new t("invalid signature integer: negative");if(e.length>1&&e[0]===0&&!(e[1]&128))throw new t("invalid signature integer: unnecessary leading zero");return W(e)}},toSig(e,t){let{Err:r,_int:n,_tlv:o}=K;if(t!==void 0&&(at(t,"maxScalarBytes"),t<1))throw new r("invalid signature: maxScalarBytes must be positive");let i=N(e,void 0,"signature"),{v:f,l:c}=o.decode(48,i);if(c.length)throw new r("invalid signature: left bytes after parsing");let{v:s,l:a}=o.decode(2,f),{v:l,l:B}=o.decode(2,a);if(B.length)throw new r("invalid signature: left bytes after parsing");if(t!==void 0&&(s.length>t||l.length>t))throw new r("invalid signature: integer too large");return{r:n.decode(s),s:n.decode(l)}},hexFromSig(e){let{_tlv:t,_int:r}=K;rt(e,{r:"bigint",s:"bigint"},{},"sig");let n=t.encode(2,r.encode(e.r)),o=t.encode(2,r.encode(e.s)),i=n+o;return t.encode(48,i)}},Vt=(Object.freeze(K._tlv),Object.freeze(K._int),Object.freeze(K));/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var sn=(e,t)=>(e+(e>=0?t:-t)/fn)/t;function Xn(e,t,r){se("scalar",e,Q,r);let[[n,o],[i,f]]=t,c=sn(f*e,r),s=sn(-o*e,r),a=e-c*n-s*i,l=-c*o-s*f,B=a<Q,m=l<Q;B&&(a=-a),m&&(l=-l);let y=Rt(Math.ceil(gt(r)/2))+dt;if(a<Q||a>=y||l<Q||l>=y)throw new Error("splitScalar (endomorphism): failed for k");return{k1neg:B,k1:a,k2neg:m,k2:l}}function ye(e){if(!["compact","recovered","der"].includes(e))throw new Error('Signature format must be "compact", "recovered", or "der"');return e}function ge(e,t){rt(e);let r={};for(let n of Object.keys(t))r[n]=e[n]===void 0?t[n]:e[n];return z(r.lowS,"lowS"),z(r.prehash,"prehash"),r.format!==void 0&&ye(r.format),r}var Q=BigInt(0),dt=BigInt(1),fn=BigInt(2),we=BigInt(3),Vn=BigInt(4);function cn(e,t={}){let r=nn("weierstrass",e,t),n=r.Fp,o=r.Fn,i=r.CURVE,{h:f,n:c}=i;rt(t,{},{allowInfinityPoint:"boolean",clearCofactor:"function",isTorsionFree:"function",fromBytes:"function",toBytes:"function",endo:"object",randomBytes:"function"});let{endo:s,allowInfinityPoint:a,clearCofactor:l,isTorsionFree:B,fromBytes:m,toBytes:y}=t,O=t.randomBytes===void 0?Zt:t.randomBytes;if(s&&(!n.is0(i.a)||typeof s.beta!="bigint"||!Array.isArray(s.basises)))throw new Error('invalid endo: expected "beta": bigint and "basises": array');let H=s?{beta:s.beta,basises:s.basises.map(u=>[...u])}:void 0,R=dn(n,o);function I(){if(!n.isOdd)throw new Error("compression is not supported: Field does not have .isOdd()")}function D(u,d,h){if(d.is0()){if(!a)throw new Error("bad point: ZERO");return Uint8Array.of(0)}let{x:p,y:w}=d.toAffine(),E=n.toBytes(p);if(z(h,"isCompressed"),h){I();let x=!n.isOdd(w);return V(an(x),E)}else return V(Uint8Array.of(4),E,n.toBytes(w))}function it(u){N(u,void 0,"Point");let{publicKey:d,publicKeyUncompressed:h}=R,p=u.length,w=u[0],E=u.subarray(1);if(a&&p===1&&w===0)return{x:n.ZERO,y:n.ZERO};if(p===d&&(w===2||w===3)){let x=n.fromBytes(E);if(!n.isValid(x))throw new Error("bad point: is not on curve, wrong x");let S=mt(x),v;try{v=n.sqrt(S)}catch(L){let U=L instanceof Error?": "+L.message:"";throw new Error("bad point: is not on curve, sqrt error"+U)}I();let A=n.isOdd(v);return(w&1)===1!==A&&(v=n.neg(v)),{x,y:v}}else if(p===h&&w===4){let x=n.BYTES,S=n.fromBytes(E.subarray(0,x)),v=n.fromBytes(E.subarray(x,x*2));if(!ht(S,v))throw new Error("bad point: is not on curve");return{x:S,y:v}}else throw new Error(`bad point: got length ${p}, expected compressed=${d} or uncompressed=${h}`)}let ut=y===void 0?D:y,Tt=m===void 0?it:m,lt=n.mul(i.b,we),G=n.is0(i.a)?u=>n.ZERO:u=>n.mul(i.a,u);function mt(u){let d=n.sqr(u),h=n.mul(d,u);return n.add(n.add(h,n.mul(u,i.a)),i.b)}function ht(u,d){let h=n.sqr(d),p=mt(u);return n.eql(h,p)}if(!ht(i.Gx,i.Gy))throw new Error("bad curve params: generator point");let Z=n.mul(n.pow(i.a,we),Vn),At=n.mul(n.sqr(i.b),BigInt(27));if(n.is0(n.add(Z,At)))throw new Error("bad curve params: a or b");function st(u,d,h=!1){if(!n.isValid(d)||h&&n.is0(d))throw new Error(`bad point coordinate ${u}`);return typeof d=="object"&&d!==null?n.create(d):d}function pt(u){if(!(u instanceof P))throw new Error("Weierstrass Point expected")}function _t(u){if(!H||!H.basises)throw new Error("no endo");return Xn(u,H.basises,o.ORDER)}function ft(u,d,h,p){if(!o.isValid(p))throw new RangeError("invalid scalar: out of range");if(H){let{k1neg:w,k1:E,k2neg:x,k2:S}=_t(p),v=new P(n.mul(h.X,H.beta),h.Y,h.Z);u.push(w?h.negate():h,x?v.negate():v),d.push(E,S)}else u.push(h),d.push(p)}let Ht=new WeakSet,g=class g{constructor(d,h,p){b(this,"X");b(this,"Y");b(this,"Z");this.X=st("x",d),this.Y=st("y",h,!0),this.Z=st("z",p),Object.freeze(this)}static CURVE(){return i}static fromAffine(d){let{x:h,y:p}=d||{};if(!d||!n.isValid(h)||!n.isValid(p))throw new Error("invalid affine point");if(d instanceof g)throw new Error("projective point not allowed");return n.is0(h)&&n.is0(p)?g.ZERO:new g(h,p,n.ONE)}static fromBytes(d){let h=g.fromAffine(Tt(N(d,void 0,"point")));return h.assertValidity(),h}static fromHex(d){return g.fromBytes(Mt(d))}get x(){return this.toAffine().x}get y(){return this.toAffine().y}precompute(d=6,h=!0){return J.setWindowSize(this,d),h||this.multiply(we),this}assertValidity(){let d=this;if(d.is0()){if(a&&n.is0(d.X)&&n.eql(d.Y,n.ONE)&&n.is0(d.Z))return;throw new Error("bad point: ZERO")}if(Ht.has(d))return;let{x:h,y:p}=d.toAffine();if(!n.isValid(h)||!n.isValid(p))throw new Error("bad point: x or y not field elements");if(!ht(h,p))throw new Error("bad point: equation left != right");if(!d.isTorsionFree())throw new Error("bad point: not in prime-order subgroup");Ht.add(d)}hasEvenY(){let{y:d}=this.toAffine();if(!n.isOdd)throw new Error("Field doesn't support isOdd");return!n.isOdd(d)}equals(d){pt(d);let{X:h,Y:p,Z:w}=this,{X:E,Y:x,Z:S}=d,v=n.eql(n.mul(h,S),n.mul(E,w)),A=n.eql(n.mul(p,S),n.mul(x,w));return v&&A}negate(){return new g(this.X,n.neg(this.Y),this.Z)}double(){let{X:d,Y:h,Z:p}=this,w=n.ZERO,E=n.ZERO,x=n.ZERO,S=n.mul(d,d),v=n.mul(h,h),A=n.mul(p,p),T=n.mul(d,h);return T=n.add(T,T),x=n.mul(d,p),x=n.add(x,x),w=G(x),E=n.mul(lt,A),E=n.add(w,E),w=n.sub(v,E),E=n.add(v,E),E=n.mul(w,E),w=n.mul(T,w),x=n.mul(lt,x),A=G(A),T=n.sub(S,A),T=G(T),T=n.add(T,x),x=n.add(S,S),S=n.add(x,S),S=n.add(S,A),S=n.mul(S,T),E=n.add(E,S),A=n.mul(h,p),A=n.add(A,A),S=n.mul(A,T),w=n.sub(w,S),x=n.mul(A,v),x=n.add(x,x),x=n.add(x,x),new g(w,E,x)}add(d){pt(d);let{X:h,Y:p,Z:w}=this,{X:E,Y:x,Z:S}=d,v=n.ZERO,A=n.ZERO,T=n.ZERO,L=n.mul(h,E),U=n.mul(p,x),q=n.mul(w,S),j=n.add(h,p),F=n.add(E,x);j=n.mul(j,F),F=n.add(L,U),j=n.sub(j,F),F=n.add(h,w);let M=n.add(E,S);return F=n.mul(F,M),M=n.add(L,q),F=n.sub(F,M),M=n.add(p,w),v=n.add(x,S),M=n.mul(M,v),v=n.add(U,q),M=n.sub(M,v),T=G(F),v=n.mul(lt,q),T=n.add(v,T),v=n.sub(U,T),T=n.add(U,T),A=n.mul(v,T),U=n.add(L,L),U=n.add(U,L),q=G(q),F=n.mul(lt,F),U=n.add(U,q),q=n.sub(L,q),q=G(q),F=n.add(F,q),L=n.mul(U,F),A=n.add(A,L),L=n.mul(M,F),v=n.mul(j,v),v=n.sub(v,L),L=n.mul(j,U),T=n.mul(M,T),T=n.add(T,L),new g(v,A,T)}subtract(d){return pt(d),this.add(d.negate())}is0(){return this.equals(g.ZERO)}multiply(d){if(!o.isValidNot0(d))throw new RangeError("invalid scalar: out of range");let{p:h,f:p}=J.mulSecret(this,d,f,Et);return Et([h,p])[0]}multiplyUnsafe(d){let h=this,p=d;if(!o.isValid(p))throw new RangeError("invalid scalar: out of range");if(p===Q||h.is0())return g.ZERO;if(p===dt)return h;if(J.hasWindowSize(this))return J.mulUnsafe(h,p,Et);let w=[],E=[];return ft(w,E,h,p),Gt(g,w,E)}mulAddUnsafe(d,h,p){pt(h);let w=[],E=[];return ft(w,E,this,d),ft(w,E,h,p),Gt(g,w,E)}toAffine(d){let h=this,p=d;if(p!=null&&!n.isValid(p))throw new RangeError('"invertedZ" expected valid field element');let{X:w,Y:E,Z:x}=h;if(n.eql(x,n.ONE))return{x:w,y:E};let S=h.is0();p==null&&(p=S?n.ONE:n.inv(x));let v=n.mul(w,p),A=n.mul(E,p),T=n.mul(x,p);if(S)return{x:n.ZERO,y:n.ZERO};if(!n.eql(T,n.ONE))throw new Error("invZ was invalid");return{x:v,y:A}}isTorsionFree(){return f===dt?!0:B?B(g,this):J.mulUnsafe(this,c).is0()}clearCofactor(){return f===dt?this:l?l(g,this):this.multiplyUnsafe(f)}isSmallOrder(){return f===dt?this.is0():this.clearCofactor().is0()}toBytes(d=!0){return z(d,"isCompressed"),this.assertValidity(),ut(g,this,d)}toHex(d=!0){return ne(this.toBytes(d))}toString(){return`<Point ${this.is0()?"ZERO":this.toHex()}>`}};b(g,"BASE",new g(i.Gx,i.Gy,n.ONE)),b(g,"ZERO",new g(n.ZERO,n.ONE,n.ZERO)),b(g,"Fp",n),b(g,"Fn",o);let P=g,Et=u=>Je(P,u),J=new Wt(P,O);return J.bits>=6&&P.BASE.precompute(6),Object.freeze(P.prototype),Object.freeze(P),P}function an(e){return Uint8Array.of(e?2:3)}function dn(e,t){return{secretKey:t.BYTES,publicKey:1+e.BYTES,publicKeyUncompressed:1+2*e.BYTES,publicKeyHasPrefix:!0,signature:2*t.BYTES}}function Kn(e,t={}){yt(e);let{Fn:r}=e,n=t.randomBytes===void 0?Zt:t.randomBytes,o=Object.assign(dn(e.Fp,r),{seed:Math.max(zt(r.ORDER),16)});function i(y){try{let O=r.fromBytes(y);return r.isValidNot0(O)}catch{return!1}}function f(y,O){let{publicKey:H,publicKeyUncompressed:R}=o;try{let I=y.length;return O===!0&&I!==H||O===!1&&I!==R?!1:!e.fromBytes(y).is0()}catch{return!1}}function c(y){return y=y===void 0?n(o.seed):y,ue(N(y,o.seed,"seed"),r.ORDER)}function s(y,O=!0){return e.BASE.multiply(r.fromBytes(y)).toBytes(O)}function a(y){let{secretKey:O,publicKey:H,publicKeyUncompressed:R}=o,I=r._lengths;if(!xt(y))return;let D=N(y,void 0,"key").length,it=D===H||D===R,ut=D===O||!!I?.includes(D);if(!(it&&ut))return it}function l(y,O,H=!0){if(a(y)===!0)throw new Error("first arg must be private key");if(a(O)===!1)throw new Error("second arg must be public key");let R=r.fromBytes(y),I=e.fromBytes(O);if(I.is0())throw new Error("invalid public key: point at infinity");return I.multiply(R).toBytes(H)}let B={isValidSecretKey:i,isValidPublicKey:f,randomSecretKey:c},m=rn(c,s);return Object.freeze(B),Object.freeze(o),Object.freeze({getPublicKey:s,getSharedSecret:l,keygen:m,Point:e,utils:B,lengths:o})}function un(e,t,r={}){yt(e);let n=t;Ft(n),rt(r,{},{hmac:"function",lowS:"boolean",randomBytes:"function",bits2int:"function",bits2int_modN:"function"});let o=Object.assign({},r),i=o.randomBytes===void 0?Zt:o.randomBytes,f=o.hmac===void 0?(g,u)=>on(n,g,u):o.hmac,{Fp:c,Fn:s}=e,{ORDER:a,BITS:l}=s,B=zt(a),m=be(i,B),{keygen:y,getPublicKey:O,getSharedSecret:H,utils:R,lengths:I}=Kn(e,o),D={prehash:!0,lowS:typeof o.lowS=="boolean"?o.lowS:!0,format:"compact",extraEntropy:!1},it=a*fn+dt<c.ORDER;function ut(g){let u=a>>dt;return g>u}function Tt(g,u){if(!s.isValidNot0(u))throw new Error(`invalid signature ${g}: out of range 1..Point.Fn.ORDER`);return u}function lt(){if(!c.isOdd)throw new Error("Field doesn't support isOdd")}function G(g,u,d){return lt(),(g===d?0:2)|Number(c.isOdd(u))}function mt(){if(it)throw new Error('"recovered" sig type is not supported for cofactor >2 curves')}function ht(g,u){ye(u);let d=I.signature,h=u==="compact"?d:u==="recovered"?d+1:void 0;return N(g,h)}class Z{constructor(u,d,h){b(this,"r");b(this,"s");b(this,"recovery");if(this.r=Tt("r",u),this.s=Tt("s",d),h!=null){if(mt(),![0,1,2,3].includes(h))throw new Error("invalid recovery id");this.recovery=h}Object.freeze(this)}static fromBytes(u,d=D.format){ht(u,d);let h;if(d==="der"){if(u.length>2*s.BYTES+16)throw new Vt.Err("invalid signature: DER signature too long");let{r:x,s:S}=Vt.toSig(N(u),s.BYTES+1);return new Z(x,S)}d==="recovered"&&(h=u[0],d="compact",u=u.subarray(1));let p=I.signature/2,w=u.subarray(0,p),E=u.subarray(p,p*2);return new Z(s.fromBytes(w),s.fromBytes(E),h)}static fromHex(u,d){return this.fromBytes(Mt(u),d)}assertRecovery(){let{recovery:u}=this;if(u==null)throw new Error("invalid recovery id: must be present");return u}addRecoveryBit(u){return new Z(this.r,this.s,u)}recoverPublicKey(u){let{r:d,s:h}=this,p=this.assertRecovery(),w=p===2||p===3?d+a:d;if(!c.isValid(w))throw new Error("invalid recovery id: sig.r+curve.n != R.x");let E=c.toBytes(w),x=e.fromBytes(V(an((p&1)===0),E)),S=s.inv(w),v=st(N(u,void 0,"msgHash")),A=s.create(-v*S),T=s.create(h*S),L=e.BASE.mulAddUnsafe(A,x,T);if(L.is0())throw new Error("invalid recovery: point at infinify");return L.assertValidity(),L}hasHighS(){return ut(this.s)}toBytes(u=D.format){if(ye(u),u==="der")return Mt(Vt.hexFromSig(this));let{r:d,s:h}=this,p=s.toBytes(d),w=s.toBytes(h);return u==="recovered"?(mt(),V(Uint8Array.of(this.assertRecovery()),p,w)):V(p,w)}toHex(u){return ne(this.toBytes(u))}}Object.freeze(Z.prototype),Object.freeze(Z);let At=o.bits2int===void 0?function(u){if(u.length>8192)throw new Error("input is too large");let d=W(u),h=u.length*8-l;return h>0?d>>BigInt(h):d}:o.bits2int,st=o.bits2int_modN===void 0?function(u){return s.create(At(u))}:o.bits2int_modN,pt=Rt(l);function _t(g){return se("num < 2^"+l,g,Q,pt),s.toBytes(g)}function ft(g,u){return N(g,void 0,"message"),u?N(n(g),void 0,"prehashed message"):g}function Ht(g,u,d){let{lowS:h,prehash:p,extraEntropy:w}=ge(d,D);g=ft(g,p);let E=st(g),x=s.fromBytes(u);if(!s.isValidNot0(x))throw new Error("invalid private key");let S=[_t(x),_t(E)];if(w!=null&&w!==!1){let L=w===!0?i(I.secretKey):w;S.push(N(L,void 0,"extraEntropy"))}let v=V(...S),A=E;function T(L){let U=At(L);if(!s.isValidNot0(U))return;let q=e.BASE.multiply(U).toAffine(),j=s.create(q.x);if(j===Q)return;let F;if(m!==void 0){let Bt=W(ue(m(B),a)),ln=s.inv(s.mul(Bt,U)),hn=s.mul(Bt,A),pn=s.mul(Bt,x);F=s.create(ln*s.create(hn+pn*j))}else{let Bt=ze(U,a);F=s.create(Bt*s.create(A+j*x))}if(F===Q)return;let M=G(q.x,q.y,j),Ee=F;return h&&ut(F)&&(Ee=s.neg(F),M^=1),new Z(j,Ee,it?void 0:M)}return{seed:v,k2sig:T}}function P(g,u,d={}){let{seed:h,k2sig:p}=Ht(g,u,d);return qe(n.outputLen,s.BYTES,f)(h,p).toBytes(d.format)}function Et(g,u,d,h={}){let{lowS:p,prehash:w,format:E}=ge(h,D);if(d=N(d,void 0,"publicKey"),u=ft(u,w),!xt(g)){let x=g instanceof Z?", use sig.toBytes()":"";throw new Error("verify expects Uint8Array signature"+x)}ht(g,E);try{let x=Z.fromBytes(g,E),S=e.fromBytes(d);if(S.is0()||p&&x.hasHighS())return!1;let{r:v,s:A}=x,T=st(u),L=s.inv(A),U=s.create(T*L),q=s.create(v*L),j=e.BASE.mulAddUnsafe(U,S,q);if(j.is0())return!1;let F=j.toAffine();return!(s.create(F.x)!==v||E==="recovered"&&x.recovery!==G(F.x,F.y,v))}catch{return!1}}function J(g,u,d={}){let{prehash:h}=ge(d,D);return u=ft(u,h),Z.fromBytes(g,"recovered").recoverPublicKey(u).toBytes()}return Object.freeze({keygen:y,getPublicKey:O,getSharedSecret:H,utils:R,lengths:I,Point:e,sign:P,verify:Et,recoverPublicKey:J,Signature:Z,hash:n})}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var Qn={p:BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"),n:BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"),h:BigInt(1),a:BigInt("0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc"),b:BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b"),Gx:BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),Gy:BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")};var Jn=cn(Qn),me=un(Jn,Fe);function tr(e){return Array.from(me.getPublicKey(Uint8Array.from(e),!1))}function er(e,t){return Array.from(me.sign(Uint8Array.from(e),Uint8Array.from(t),{prehash:!0,format:"compact",lowS:!0,extraEntropy:!1}))}return En(nr);})();

// END GENERATED PUSH CRYPTO
