/**
 * TocToc · Backend Google Sheets / Apps Script V8.
 * 1. Pega este archivo y ejecuta setup(). 2. Despliega como Web App.
 * 3. Usa el código del registro para crear el primer jefe desde admin.html.
 * No publiques el Sheet. No añadas secretos a config.js.
 */
const DB_ID = "1RY7f8Xuel5-tK9e_PQhXgscinU8AQN45pge5p-f16u8";
const TZ = "America/Bogota";
const SESSION_HOURS = 8;
const APP_VERSION = "1.3.4";
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
  PushKeys: ['id','p256dh','auth','updatedAt'],
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
      application: "TocToc",
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
    // Send after saving and releasing the business lock, even if the tab closes.
    // A new grant must be saved on the device before dispatching its catch-up.
    if(data&&data.pushDispatch&&input.action!=='subscribePush'){
      try{dispatchPush_(data.pushDispatch);data.pushDispatched=true;}catch(error){console.error('El aviso queda en cola para reintento.');}
    }
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
  if(action==='pushStatus')return pushStatus_(d);
  if(action==='pushReceived')return pushReceived_(d);
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
  if(action==='preparePush')return preparePush_(actor);
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
      return name==='PushSubscriptions'||name==='PushEvents'||name==='PushKeys'||!!book.getSheetByName(name);
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
  const key = "order:" + digest_(id)+':'+(PropertiesService.getScriptProperties().getProperty('orderEpoch')||'0');
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
          const priority={pending:0,accepted:1,completed:2,cancelled:3};
          return (priority[a.status]-priority[b.status])||a.createdAt.localeCompare(b.createdAt)||a._row-b._row;
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
  // Publish the revision only after Sheets has committed the written rows.
  SpreadsheetApp.flush();
  PropertiesService.getScriptProperties().setProperty('orderEpoch',random_());
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
function preparePush_(actor) {
  owner_(actor);
  return locked_(function () {
    owner_(authenticate_(actor._token));
    ["PushSubscriptions", "PushEvents", "PushKeys"].forEach(function (name) {
      const s = book_().getSheetByName(name) || book_().insertSheet(name),
        columns = SCHEMA[name];
      if (s.getLastRow() > 0) {
        if (
          JSON.stringify(s.getRange(1, 1, 1, columns.length).getValues()[0]) !==
          JSON.stringify(columns)
        )
          fail_(
            "PUSH_SETUP_REQUIRED",
            "El jefe debe revisar la preparación de los avisos.",
          );
      } else s.getRange(1, 1, 1, columns.length).setValues([columns]);
      s.setFrozenRows(1);
    });
    if (
      !ScriptApp.getProjectTriggers().some(function (t) {
        return t.getHandlerFunction() === "deliverPushQueue";
      })
    )
      ScriptApp.newTrigger("deliverPushQueue")
        .timeBased()
        .everyMinutes(1)
        .create();
    audit_(actor, "PUSH_PREPARED", actor.id);
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
  if (
    d.keys &&
    (!/^[A-Za-z0-9_-]{87}$/.test(String(d.keys.p256dh)) ||
      !/^[A-Za-z0-9_-]{22}$/.test(String(d.keys.auth)) ||
      !TocPushCrypto.validReceiver(pushBytes_(d.keys.p256dh)))
  )
    fail_(
      "VALIDATION",
      "No pudimos vincular de forma segura este dispositivo.",
    );
  return locked_(function () {
    rateUnlocked_("push-subscribe:" + digest_(endpoint), 20, 600);
    // Revalida el permiso tras tomar el bloqueo; no se aceptan roles del navegador.
    const fresh =
      d.scope === "admin"
        ? authenticate_(session)
        : authorizeTracking_(d, true);
    const id = digest_(endpoint + ":" + d.scope + ":" + fresh.id);
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
    if (d.keys) {
      let ks = book_().getSheetByName("PushKeys");
      if (!ks) {
        ks = book_().insertSheet("PushKeys");
        ks.getRange(1, 1, 1, SCHEMA.PushKeys.length).setValues([
          SCHEMA.PushKeys,
        ]);
      }
      const keyRow = rows_("PushKeys").find(function (k) {
        return k.id === id;
      }) || { id: id };
      keyRow.p256dh = d.keys.p256dh;
      keyRow.auth = d.keys.auth;
      keyRow.updatedAt = now;
      if (keyRow._row) write_("PushKeys", keyRow);
      else append_("PushKeys", keyRow);
      cache_().remove("push-keys");
    }
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
/** Only the holder of this device grant can read its delivery status. */
function pushStatus_(d) {
  rate_("push-status:" + text_(d.id, 64, true), 20, 60);
  const s = pushGrant_(d);
  if (d.endpoint && !equal_(s.endpoint, pushEndpoint_(d.endpoint).endpoint))
    fail_(
      "UNAUTHORIZED",
      "Este dispositivo debe volver a vincular sus avisos.",
    );
  const recent = pushRecentEvents_().filter(function (e) {
    return pushEventMatches_(e, s);
  });
  const last = recent.length ? recent[recent.length - 1] : null;
  const receipt = cached_(
    "push-receipt:" + s.id,
    function () {
      return { shownAt: system_("pushShown:" + s.id) || "" };
    },
    10,
  );
  return {
    active: true,
    encrypted: !!pushKeys_().find(function (k) {
      return k.id === s.id;
    }),
    scope: s.scope,
    requestId: s.requestId,
    expiresAt: s.expiresAt,
    shownAt: receipt.shownAt,
    last: last
      ? {
          state: last.state,
          attempts: Number(last.attempts) || 0,
          at: last.createdAt,
          error: last.lastError || "",
        }
      : null,
  };
}
function pushKeys_() {
  return book_().getSheetByName("PushKeys")
    ? cached_(
        "push-keys",
        function () {
          return rows_("PushKeys");
        },
        60,
      )
    : [];
}
function pushReceived_(d) {
  return locked_(function () {
    const s = pushGrant_(d);
    rateUnlocked_("push-received:" + s.id, 20, 60);
    const at = now_();
    setSystem_("pushShown:" + s.id, at);
    cache_().remove("push-receipt:" + s.id);
    return { shownAt: at };
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
    return pushNotification_(e, s);
  });
  return { notifications: notifications, checkedAt: Date.now() };
}
function pushNotification_(e, s) {
  if (e.kind === "test")
    return {
      id: e.id,
      title: "TocToc está listo",
      body: "Este dispositivo ya puede recibir tus avisos.",
      tag: "toc-test",
      path: s.scope === "admin" ? "admin.html#settings" : "index.html",
      scope: s.scope,
      requestId: s.requestId,
      alertKey: "test:" + e.id,
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
          ? "Hay una solicitud esperando. Abre TocToc para revisarla."
          : "Hay " +
            count +
            " solicitudes esperando. Abre TocToc para revisarlas."
        : "Abre TocToc para consultar las últimas novedades.",
      tag: "toc-services-" + s.cityId,
      path: "admin.html#inbox",
      scope: "admin",
      requestId: e.requestId,
      alertKey: "admin:" + e.requestId + ":new",
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
      "Tu servicio fue aceptado. Abre TocToc para ver sus datos.",
    ],
    completed: [
      "Pedido exitosamente realizado.",
      "Tu servicio fue marcado como completado.",
    ],
    cancelled: [
      "Tu solicitud fue cancelada",
      "Abre TocToc para consultar el estado de tu servicio.",
    ],
  }[order.status] || [
    "Hay novedades de tu servicio",
    "Abre TocToc para consultarlas.",
  ];
  return {
    id: e.id + ":" + order.status,
    title: copy[0],
    body: copy[1],
    tag: "toc-request-" + order.id,
    path: "index.html#service=" + encodeURIComponent(order.id),
    scope: "client",
    requestId: order.id,
    alertKey: "client:" + order.id + ":" + order.status,
  };
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
function pushRequest_(s, event, keyRows) {
  const dest = pushEndpoint_(s.endpoint),
    headers = {
      Authorization: pushVapidHeader_(dest.origin),
      TTL: "86400",
      Urgency: "high",
      Topic: digest_(event.audience + event.requestId).slice(0, 32),
    };
  let payload = "";
  const keys = keyRows.find(function (k) {
    return k.id === s.id;
  });
  if (keys) {
    const n = pushNotification_(event, s);
    n.grantId = s.id;
    if (s.scope === "client") {
      const order = findRequest_(s.requestId);
      n.revision = Number(order.revision) || 0;
    }
    const message = pushUtf8_(JSON.stringify({ v: 1, notification: n }));
    const secret = digest_(random_() + random_() + random_() + random_())
      .match(/../g)
      .map(function (h) {
        return parseInt(h, 16);
      });
    const salt = random_()
      .match(/../g)
      .map(function (h) {
        return parseInt(h, 16);
      });
    payload = TocPushCrypto.encrypt(
      message,
      pushBytes_(keys.p256dh),
      pushBytes_(keys.auth),
      secret,
      salt,
    ).map(function (b) {
      return b > 127 ? b - 256 : b;
    });
    headers["Content-Encoding"] = "aes128gcm";
  }
  return {
    url: dest.endpoint,
    method: "post",
    payload: payload,
    contentType: "application/octet-stream",
    headers: headers,
    muteHttpExceptions: true,
    followRedirects: false,
    validateHttpsCertificates: true,
    timeoutSeconds: 10,
  };
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
  const keyRows = pushKeys_();
  // Encrypted content displays immediately; older devices retain inbox fallback.
  for (let i = 0; i < subscriptions.length; i += 100) {
    const batch = subscriptions.slice(i, i + 100);
    try {
      const responses = UrlFetchApp.fetchAll(
        batch.map(function (s) {
          return pushRequest_(s, claimed, keyRows);
        }),
      );
      responses.forEach(function (response, index) {
        const code = response.getResponseCode();
        if (code >= 200 && code < 300) sent++;
        else if (code === 404 || code === 410) expired.push(batch[index]);
        else failed.push(String(code));
      });
    } catch (error) {
      failed.push(
        /permission|permiso|authorize|autoriz/i.test(String(error.message))
          ? "AUTHORIZATION"
          : "NETWORK",
      );
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
    if (!failed.length && !subscriptions.length) e.state = "skipped";
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
  locked_(function () {
    if (
      !rows_("PushEvents").some(function (e) {
        return ["pending", "retry", "sending"].includes(e.state);
      })
    )
      PropertiesService.getScriptProperties().setProperty("pushPending", "0");
  });
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
  if (book_().getSheetByName("PushKeys")) {
    const ids = {};
    expired.forEach(function (s) {
      ids[s.id] = true;
    });
    deleteRows_(
      "PushKeys",
      rows_("PushKeys").filter(function (k) {
        return ids[k.id];
      }),
    );
    cache_().remove("push-keys");
  }
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
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)
Copyright (c) 2016 Thomas Pornin <pornin@bolet.org>

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
var TocPushCrypto=(()=>{var Yt=Object.defineProperty;var rr=Object.getOwnPropertyDescriptor;var or=Object.getOwnPropertyNames;var sr=Object.prototype.hasOwnProperty;var ir=(t,e,r)=>e in t?Yt(t,e,{enumerable:!0,configurable:!0,writable:!0,value:r}):t[e]=r;var fr=(t,e)=>{for(var r in e)Yt(t,r,{get:e[r],enumerable:!0})},cr=(t,e,r,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of or(e))!sr.call(t,o)&&o!==r&&Yt(t,o,{get:()=>e[o],enumerable:!(n=rr(e,o))||n.enumerable});return t};var ar=t=>cr(Yt({},"__esModule",{value:!0}),t);var w=(t,e,r)=>ir(t,typeof e!="symbol"?e+"":e,r);var ao={};fr(ao,{encrypt:()=>co,publicKey:()=>so,sign:()=>io,validReceiver:()=>fo});var ur=t=>t/2**32|0,dr=t=>t>>>0;function nn(t,e,r,n){let o=ur(r),s=dr(r);t.setUint32(e,n?s:o,n),t.setUint32(e+4,n?o:s,n)}function Vt(t){return t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array"&&"BYTES_PER_ELEMENT"in t&&t.BYTES_PER_ELEMENT===1}var Ee=t=>t?`"${t}" `:"";function G(t,e=""){if(typeof t!="number")throw new TypeError(Ee(e)+"expected number, got "+typeof t);if(!Number.isSafeInteger(t)||t<0)throw new RangeError(Ee(e)+"expected integer >= 0, got "+t);return t}function $(t,e,r=""){if(Vt(t)&&(e===void 0||t.length===e))return t;e!==void 0&&G(e,"length");let n=Vt(t),o=e!==void 0?` of length ${e}`:"",s=n?`length=${t.length}`:`type=${typeof t}`,f=Ee(r)+"expected Uint8Array"+o+", got "+s;throw n?new RangeError(f):new TypeError(f)}function yt(t){if(typeof t!="function"||typeof t.create!="function")throw new TypeError("expected hash wrapped by utils.createHasher");if(G(t.outputLen),G(t.blockLen),t.outputLen<1||t.blockLen<1)throw new Error("hash blockLen / outputLen must be >= 1")}var lr=(t,e)=>{if(t===null||typeof t!="object"||Array.isArray(t))throw new TypeError((e==="object"?"":`"${e}" `)+"expected object, got type="+typeof t)},rn=(t,e)=>{lr(t,e);let r=Object.getPrototypeOf(t);if(r!==Object.prototype&&r!==null)throw new TypeError(`"${e}" expected plain object`);if(Object.hasOwn(t,"__proto__"))throw new TypeError(`"${e}.__proto__" is not allowed`)};function St(t,e=!0){if(t.destroyed)throw new Error("hash was destroyed");if(e&&t.finished)throw new Error("digest() was already called")}function Gt(t,e){$(t,void 0,"output");let r=e.outputLen;if(!(t.length>=r))throw new RangeError('"output" expected length >= '+r)}function tt(...t){for(let e=0;e<t.length;e++)t[e].fill(0)}function Xt(t){return new DataView(t.buffer,t.byteOffset,t.byteLength)}function X(t,e){return t<<32-e|t>>>e}var sn=typeof Uint8Array.from([]).toHex=="function"&&typeof Uint8Array.fromHex=="function",hr=Array.from({length:256},(t,e)=>e.toString(16).padStart(2,"0"));function Qt(t){if($(t),sn)return t.toHex();let e="";for(let r=0;r<t.length;r++)e+=hr[t[r]];return e}function on(t){return t>=48&&t<=57?t-48:t>=65&&t<=70?t-55:t>=97&&t<=102?t-87:void 0}function Be(t){if(typeof t!="string")throw new TypeError("hex string expected, got "+typeof t);if(sn)try{return Uint8Array.fromHex(t)}catch(o){throw o instanceof SyntaxError?new RangeError(o.message):o}let e=t.length,r=e/2;if(e%2)throw new RangeError("hex string expected, got unpadded hex of length "+e);let n=new Uint8Array(r);for(let o=0,s=0;o<r;o++,s+=2){let f=on(t.charCodeAt(s)),c=on(t.charCodeAt(s+1));if(f===void 0||c===void 0){let i=t[s]+t[s+1];throw new RangeError('hex string expected, got non-hex character "'+i+'" at index '+s)}n[o]=f*16+c}return n}function fn(...t){let e=0;for(let n=0;n<t.length;n++){let o=t[n];$(o),e+=o.length}let r=new Uint8Array(e);for(let n=0,o=0;n<t.length;n++){let s=t[n];r.set(s,o),o+=s.length}return r}function pr(t,e,r="opts"){return rn(t,"defaults"),e!==void 0&&rn(e,r),Object.assign(Object.create(null),t,e)}function cn(t,e={}){if(typeof t!="function")throw new TypeError('"hashCons" expected function, got type='+typeof t);e=pr({},e,"info");let r=(o,s)=>t(s).update(o).digest(),n=t(void 0);return r.outputLen=n.outputLen,r.blockLen=n.blockLen,r.canXOF=n.canXOF,r.create=o=>t(o),Object.assign(r,e),Object.freeze(r)}function an(t=32){G(t,"bytesLength");let e=typeof globalThis=="object"?globalThis.crypto:null;if(typeof e?.getRandomValues!="function")throw new Error("crypto.getRandomValues must be defined");if(t>65536)throw new RangeError(`"bytesLength" expected <= 65536, got ${t}`);return e.getRandomValues(new Uint8Array(t))}var un=t=>({oid:Uint8Array.from([6,9,96,134,72,1,101,3,4,2,t])});function dn(t,e,r){return t&e^~t&r}function ln(t,e,r){return t&e^t&r^e&r}var Jt=class{constructor(e,r,n,o){w(this,"blockLen");w(this,"outputLen");w(this,"canXOF",!1);w(this,"padOffset");w(this,"isLE");w(this,"buffer");w(this,"view");w(this,"finished",!1);w(this,"length",0);w(this,"pos",0);w(this,"destroyed",!1);this.blockLen=e,this.outputLen=r,this.padOffset=n,this.isLE=o,this.buffer=new Uint8Array(e),this.view=Xt(this.buffer)}update(e){St(this),$(e);let{view:r,buffer:n,blockLen:o}=this,s=e.length,f=!1;for(let c=0;c<s;){let i=Math.min(o-this.pos,s-c);if(i===o){let a=Xt(e);for(;o<=s-c;c+=o)this.process(a,c);f=!0;continue}n.set(c===0&&i===s?e:e.subarray(c,c+i),this.pos),this.pos+=i,c+=i,this.pos===o&&(this.process(r,0),this.pos=0,f=!0)}return this.length+=e.length,f&&this.roundClean(),this}digestInto(e){St(this),Gt(e,this),this.finished=!0;let{buffer:r,view:n,blockLen:o,isLE:s}=this,{pos:f}=this;r[f++]=128,r.fill(0,f),this.padOffset>o-f&&(this.process(n,0),r.fill(0)),nn(n,o-8,this.length*8,s),this.process(n,0),this.roundClean();let c=e===r?n:Xt(e),i=this.outputLen,a=i/4,u=this.get();if(i%4||a>u.length)throw new Error("invalid outputLen");for(let l=0;l<a;l++)c.setUint32(4*l,u[l],s)}digest(){let{buffer:e,outputLen:r}=this;this.digestInto(e);let n=e.slice(0,r);return this.destroy(),n}_cloneIntoMeta(e){let{buffer:r,length:n,finished:o,destroyed:s,pos:f}=this;return e.destroyed=s,e.finished=o,e.length=n,e.pos=f,f&&e.buffer.set(r),e}clone(){return this._cloneInto()}},hn=Uint32Array.from([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]);var gr=Uint32Array.from([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]),ut=new Uint32Array(64),Ae=class extends Jt{constructor(r,n){super(64,r,8,!1);w(this,"A",0);w(this,"B",0);w(this,"C",0);w(this,"D",0);w(this,"E",0);w(this,"F",0);w(this,"G",0);w(this,"H",0);this.A=n[0]|0,this.B=n[1]|0,this.C=n[2]|0,this.D=n[3]|0,this.E=n[4]|0,this.F=n[5]|0,this.G=n[6]|0,this.H=n[7]|0}get(){let{A:r,B:n,C:o,D:s,E:f,F:c,G:i,H:a}=this;return[r,n,o,s,f,c,i,a]}set(r,n,o,s,f,c,i,a){this.A=r|0,this.B=n|0,this.C=o|0,this.D=s|0,this.E=f|0,this.F=c|0,this.G=i|0,this.H=a|0}_cloneInto(r){return(r||(r=new this.constructor)).set(...this.get()),this._cloneIntoMeta(r)}process(r,n){for(let p=0;p<16;p++,n+=4)ut[p]=r.getUint32(n,!1);for(let p=16;p<64;p++){let g=ut[p-15],y=ut[p-2],S=X(g,7)^X(g,18)^g>>>3,A=X(y,17)^X(y,19)^y>>>10;ut[p]=A+ut[p-7]+S+ut[p-16]|0}let{A:o,B:s,C:f,D:c,E:i,F:a,G:u,H:l}=this;for(let p=0;p<64;p++){let g=X(i,6)^X(i,11)^X(i,25),y=l+g+dn(i,a,u)+gr[p]+ut[p]|0,A=(X(o,2)^X(o,13)^X(o,22))+ln(o,s,f)|0;l=u,u=a,a=i,i=c+y|0,c=f,f=s,s=o,o=y+A|0}o=o+this.A|0,s=s+this.B|0,f=f+this.C|0,c=c+this.D|0,i=i+this.E|0,a=a+this.F|0,u=u+this.G|0,l=l+this.H|0,this.set(o,s,f,c,i,a,u,l)}roundClean(){tt(ut)}destroy(){this.destroyed=!0,this.set(0,0,0,0,0,0,0,0),tt(this.buffer)}},ve=class extends Ae{constructor(){super(32,hn)}};var Tt=cn(()=>new ve,un(1));/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */function ee(t,e,r=()=>{}){if(!Array.isArray(t))throw new TypeError(`"${e}" expected array, got type=${typeof t}`);for(let n=0;n<t.length;n++)r(t[n],`${e}[${n}]`);return t}var N=(t,e,r)=>$(t,e,r),Se=G;function gn(t,e=""){if(typeof t!="string"){let r=e&&`"${e}" `;throw new TypeError(r+"expected string, got type="+typeof t)}return t}function dt(t,e="object"){if(t===null||typeof t!="object"||Array.isArray(t))throw new TypeError(e==="object"?"expected valid options object":`"${e}" expected object, got type=${typeof t}`);return t}function xt(t,e){if(typeof t!="function")throw new TypeError(`"${e}" is invalid: expected function, got ${typeof t}`);return t}var Te=Qt,ot=(...t)=>fn(...t),ne=t=>Be(t),Ot=Vt,re=t=>an(t),te=BigInt(0),pn=BigInt(1),br=t=>t?`"${t}" `:"";function et(t,e=""){if(typeof t!="boolean")throw new TypeError(br(e)+"expected boolean, got type="+typeof t);return t}function oe(t){if(typeof t=="bigint"){if(!lt(t))throw new RangeError("positive bigint expected, got "+t)}else Se(t);return t}function mt(t,e=""){if(typeof t!="number"){let r=e&&`"${e}" `;throw new TypeError(r+"expected number, got type="+typeof t)}if(!Number.isSafeInteger(t)){let r=e&&`"${e}" `;throw new RangeError(r+"expected safe integer, got "+t)}}function Nt(t){let e=oe(t).toString(16);return e.length&1?"0"+e:e}function bn(t){if(typeof t!="string")throw new TypeError("hex string expected, got "+typeof t);return t===""?te:BigInt("0x"+t)}function nt(t){return bn(Qt(t))}function Oe(t){return bn(Qt(wr($(t)).reverse()))}function se(t,e){if(G(e),e===0)throw new Error("zero output length is invalid");t=oe(t);let r=e*2,n=t.toString(16);if(n.length>r)throw new RangeError("number is too large");return Be(n.padStart(r,"0"))}function Le(t,e){return se(t,e).reverse()}function wr(t){return Uint8Array.from(N(t))}function lt(t){return typeof t=="bigint"&&te<=t}function Re(t,e,r){return lt(t)&&lt(e)&&lt(r)&&e<=t&&t<r}function Ue(t,e,r,n){if(!Re(e,r,n))throw new RangeError("expected valid "+t+": "+r+" <= n < "+n+", got "+e)}function Lt(t){if(t<te)throw new Error("expected non-negative bigint, got "+t);return t===te?0:t.toString(2).length}var kt=t=>(mt(t,"n"),(pn<<BigInt(t))-pn);function wn(t,e,r){if(G(t,"hashLen"),G(e,"qByteLen"),typeof r!="function")throw new TypeError("hmacFn must be a function");let n=A=>new Uint8Array(A),o=Uint8Array.of(),s=Uint8Array.of(0),f=Uint8Array.of(1),c=1e3,i=n(t),a=n(t),u=0,l=()=>{i.fill(1),a.fill(0),u=0},p=(...A)=>r(a,ot(i,...A)),g=(A=o)=>{a=p(s,A),i=p(),A.length!==0&&(a=p(f,A),i=p())},y=()=>{if(u++>=c)throw new Error("drbg: tried max amount of iterations");let A=0,L=[];for(;A<e;){i=p();let R=i.slice();L.push(R),A+=i.length}return ot(...L)};return(A,L)=>{l(),g(A);let R;for(;(R=L(y()))===void 0;)g();return l(),R}}function ht(t,e={},r={},n="object"){dt(t,n),dt(e,"fields"),dt(r,"optFields");function o(f,c,i){let a=n==="object"?`param "${String(f)}"`:`"${n}.${String(f)}"`,u=t[f];if(!Object.hasOwn(t,f)&&(i?u!==void 0:c!=="function"))throw new TypeError(`${a} is invalid: expected own property`);if(i&&u===void 0)return;let l=typeof u;if(l!==c||u===null)throw new TypeError(`${a} is invalid: expected ${c}, got ${l}`)}let s=(f,c)=>Object.entries(f).forEach(([i,a])=>o(i,a,c));s(e,!1),s(r,!0)}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var q=BigInt(0),I=BigInt(1),pt=BigInt(2),En=BigInt(3),_e=BigInt(4),Bn=BigInt(5),yr=BigInt(7),An=BigInt(8),xr=BigInt(9),mr=BigInt(15),vn=BigInt(16),Er=BigInt("0x10000000000000000");function W(t,e){if(e<=q)throw new Error("mod: expected positive modulus, got "+e);let r=t%e;return r>=q?r:e+r}function Sn(t,e,r){if(r<=I)throw new Error("pow: expected modulus > 1, got "+r);if(typeof e!="bigint")throw new TypeError("invalid exponent: expected bigint, got "+typeof e);if(e<q)throw new Error("invalid exponent, negatives unsupported");if(e===q)return I;if(e===I)return t;let n=t%r;if(n<q&&(n+=r),e<Er){let c=I;for(;e>q;)e&I&&(c=c*n%r),n=n*n%r,e>>=I;return c}let o=[];for(;e>q;)o.push(Number(e&mr)),e>>=_e;let s=new Array(16);s[0]=I,s[1]=n;for(let c=2;c<16;c++)s[c]=s[c-1]*n%r;let f=s[o[o.length-1]];for(let c=o.length-2;c>=0;c--){f=f*f%r,f=f*f%r,f=f*f%r,f=f*f%r;let i=o[c];i!==0&&(f=f*s[i]%r)}return f}function yn(t,e){if(t===q)throw new Error("invert: expected non-zero number");if(e<=I)throw new Error("invert: expected modulus > 1, got "+e);let r=W(t,e),n=e,o=q,s=I;for(;r!==q;){let c=n/r,i=n-r*c,a=o-s*c;n=r,r=i,o=s,s=a}if(n!==I)throw new Error("invert: does not exist");return W(o,e)}function Tn(t,e){if(e<=I)throw new Error("invertCt: expected prime modulus > 1, got "+e);let r=W(t,e);if(r===q)throw new Error("invertCt: expected non-zero number");let n=Sn(r,e-pt,e);if(W(r*n,e)!==I)throw new Error("invertCt: does not exist");return n}function Ie(t,e,r){let n=t;if(!n.eql(n.sqr(e),r))throw new Error("Cannot find square root")}function He(t,e){if((t&I)===q)throw new Error(e+": expected odd modulus, got "+t)}function On(t,e){let r=t,n=(r.ORDER+I)/_e,o=r.pow(e,n);return Ie(r,o,e),o}function Br(t,e){let r=t,n=(r.ORDER-Bn)/An,o=r.mul(e,pt),s=r.pow(o,n),f=r.mul(e,s),c=r.mul(r.mul(f,pt),s),i=r.mul(f,r.sub(c,r.ONE));return Ie(r,i,e),i}function Ar(t){let e=fe(t),r=Ln(t),n=r(e,e.neg(e.ONE)),o=r(e,n),s=r(e,e.neg(n)),f=(t+yr)/vn;return((c,i)=>{let a=c,u=a.pow(i,f),l=a.mul(u,n),p=a.mul(u,o),g=a.mul(u,s),y=a.eql(a.sqr(l),i),S=a.eql(a.sqr(p),i);u=a.cmov(u,l,y),l=a.cmov(g,p,S);let A=a.eql(a.sqr(l),i),L=a.cmov(u,l,A);return Ie(a,L,i),L})}function Ln(t){if(t<En)throw new Error("sqrt is not defined for small field");He(t,"tonelliShanks");let e=t-I,r=0;for(;e%pt===q;)e/=pt,r++;let n=pt,o=fe(t);for(;xn(o,n)===1;)if(n++>1e3)throw new Error("Cannot find square root: probably non-prime P");if(r===1)return On;let s=o.pow(n,e),f=(e+I)/pt;return function(i,a){let u=i;if(u.is0(a))return a;if(xn(u,a)!==1)throw new Error("Cannot find square root");let l=r,p=u.mul(u.ONE,s),g=u.pow(a,e),y=u.pow(a,f);for(;!u.eql(g,u.ONE);){if(u.is0(g))throw new Error("Cannot find square root: probably non-prime P");let S=1,A=u.sqr(g);for(;!u.eql(A,u.ONE);)if(S++,A=u.sqr(A),S===l)throw new Error("Cannot find square root");let L=I<<BigInt(l-S-1),R=u.pow(p,L);l=S,p=u.sqr(R),g=u.mul(g,p),y=u.mul(y,R)}return y}}function vr(t){return He(t,"Fp.sqrt"),t%_e===En?On:t%An===Bn?Br:t%vn===xr?Ar(t):Ln(t)}var Sr=["create","isValid","is0","neg","inv","sqrt","sqr","eql","add","sub","mul","pow","div","addN","subN","mulN","sqrN"];function Rt(t){if(dt(t,"field"),typeof t.ORDER!="bigint")throw new TypeError('param "ORDER" is invalid: expected bigint, got '+typeof t.ORDER);mt(t.BYTES,"BYTES"),mt(t.BITS,"BITS");for(let e of Sr)xt(t[e],"field."+e);if(t.BYTES<1||t.BITS<1)throw new Error("invalid field: expected BYTES/BITS > 0");if(t.ORDER<=I)throw new Error("invalid field: expected ORDER > 1, got "+t.ORDER);return t}function Ce(t,e,r=!1){Rt(t),ee(e,"nums"),et(r,"passZero");let n=t,o=new Array(e.length).fill(r?n.ZERO:void 0),s=e.reduce((c,i,a)=>n.is0(i)?c:(o[a]=c,n.mul(c,i)),n.ONE),f=n.inv(s);return e.reduceRight((c,i,a)=>n.is0(i)?c:(o[a]=n.mul(c,o[a]),n.mul(c,i)),f),o}function xn(t,e){Rt(t);let r=t;He(r.ORDER,"FpLegendre");let n=(r.ORDER-I)/pt,o=r.pow(e,n),s=r.eql(o,r.ONE),f=r.eql(o,r.ZERO),c=r.eql(o,r.neg(r.ONE));if(!s&&!f&&!c)throw new Error("invalid Legendre symbol result");return s?1:f?0:-1}function Tr(t,e){if(e!==void 0&&Se(e),t<=q)throw new Error("invalid n length: expected positive n, got "+t);if(e!==void 0&&e<1)throw new Error("invalid n length: expected positive bit length, got "+e);let r=Lt(t);if(e!==void 0&&e<r)throw new Error(`invalid n length: expected nBitLength (${e}) >= bitLen(n) (${r})`);let n=e!==void 0?e:r,o=Math.ceil(n/8);return{nBitLength:n,nByteLength:o}}var mn=new WeakMap,ie=class{constructor(e,r={}){w(this,"ORDER");w(this,"BITS");w(this,"BYTES");w(this,"isLE");w(this,"ZERO",q);w(this,"ONE",I);w(this,"_lengths");w(this,"_mod");if(e<=I)throw new Error("invalid field: expected ORDER > 1, got "+e);let n;this.isLE=!1,r!=null&&typeof r=="object"&&(typeof r.BITS=="number"&&(n=r.BITS),typeof r.sqrt=="function"&&Object.defineProperty(this,"sqrt",{value:r.sqrt,enumerable:!0}),typeof r.isLE=="boolean"&&(this.isLE=r.isLE),r.allowedLengths&&(this._lengths=Object.freeze(r.allowedLengths.slice())),typeof r.modFromBytes=="boolean"&&(this._mod=r.modFromBytes));let{nBitLength:o,nByteLength:s}=Tr(e,n);if(s>2048)throw new Error("invalid field: expected ORDER of <= 2048 bytes");this.ORDER=e,this.BITS=o,this.BYTES=s,Object.freeze(this)}create(e){return W(e,this.ORDER)}isValid(e){if(typeof e!="bigint")throw new TypeError("invalid field element: expected bigint, got "+typeof e);return q<=e&&e<this.ORDER}is0(e){return e===q}isValidNot0(e){return!this.is0(e)&&this.isValid(e)}isOdd(e){return(e&I)===I}neg(e){return W(-e,this.ORDER)}eql(e,r){return e===r}sqr(e){return W(e*e,this.ORDER)}add(e,r){return W(e+r,this.ORDER)}sub(e,r){return W(e-r,this.ORDER)}mul(e,r){return W(e*r,this.ORDER)}pow(e,r){return Sn(e,r,this.ORDER)}div(e,r){return W(e*yn(r,this.ORDER),this.ORDER)}sqrN(e){return e*e}addN(e,r){return e+r}subN(e,r){return e-r}mulN(e,r){return e*r}inv(e){return yn(e,this.ORDER)}sqrt(e){let r=mn.get(this);return r||mn.set(this,r=vr(this.ORDER)),r(this,e)}toBytes(e){return this.isLE?Le(e,this.BYTES):se(e,this.BYTES)}fromBytes(e,r=!1){N(e);let{_lengths:n,BYTES:o,isLE:s,ORDER:f,_mod:c}=this;if(n){if(e.length<1||!n.includes(e.length)||e.length>o)throw new Error("Field.fromBytes: expected "+n+" bytes, got "+e.length);let a=new Uint8Array(o);a.set(e,s?0:a.length-e.length),e=a}if(e.length!==o)throw new Error("Field.fromBytes: expected "+o+" bytes, got "+e.length);let i=s?Oe(e):nt(e);if(c&&(i=W(i,f)),!r&&!this.isValid(i))throw new Error("invalid field element: outside of range 0..ORDER");return i}invertBatch(e){return Ce(this,e,!0)}cmov(e,r,n){return et(n,"condition"),n?r:e}};function fe(t,e={}){return Object.freeze(ie.prototype),new ie(t,e)}function Rn(t){if(typeof t!="bigint")throw new Error("field order must be bigint");if(t<=I)throw new Error("field order must be greater than 1");let e=Lt(t-I);return Math.ceil(e/8)}function ce(t){let e=Rn(t);return e+Math.ceil(e/2)}function Fe(t,e,r=!1){N(t);let n=t.length,o=Rn(e),s=Math.max(ce(e),16);if(n<s||n>1024)throw new Error("expected "+s+"-1024 bytes of input, got "+n);let f=r?Oe(t):nt(t),c=W(f,e-I)+I;return r?Le(c,o):se(c,o)}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var ke=BigInt(0),Mt=BigInt(1),Or=BigInt(4),De=16,Un=128,Lr=5,_n=2**31;function Ut(t){let e=t;if(typeof e!="function")throw new TypeError('"Point" expected constructor, got type='+typeof t);xt(e.fromAffine,"Point.fromAffine"),xt(e.fromBytes,"Point.fromBytes"),xt(e.fromHex,"Point.fromHex"),dt(e.BASE,"Point.BASE"),dt(e.ZERO,"Point.ZERO"),Rt(e.Fp),Rt(e.Fn)}function Hn(t,e){Ut(t),Cn(e,t);let r=Ce(t.Fp,e.map(n=>n.Z));return e.map((n,o)=>t.fromAffine(n.toAffine(r[o])))}function Rr(t,e,r=1){if(!Number.isSafeInteger(t)||t<r||t>e)throw new Error("invalid window size, expected ["+r+".."+e+"], got W="+t)}function Ur(t,e){let r=t*(4*e+128);if(r>_n)throw new Error("invalid window size: table would need ~"+Math.ceil(r/2**20)+" MiB, max "+_n/2**20+" MiB")}function Me(t,e){if(t!==void 0){xt(t,"randomBytes");try{let r=t(e);if(!Ot(r)||r.length!==e)return}catch{return}return t}}function Cn(t,e){ee(t,"points"),t.forEach((r,n)=>{if(!(r instanceof e))throw new Error("invalid point at index "+n)})}function _r(t,e,r){if(!Array.isArray(t))throw new Error("array of scalars expected");t.forEach((n,o)=>{if(!(r===void 0?e.isValid(n):lt(n)&&n<r))throw new Error("invalid scalar at index "+o)})}var Fn=new WeakMap;function Ne(t){return Fn.get(t)||1}function Ir(t,e){let r=t.double(),n=[t];for(let o=1;o<e;o++)n.push(n[o-1].add(r));return n}function Hr(t,e){let r=2**e,n=r/2,o=BigInt(r-1),s=[];for(;t>ke;){let f=0;t&Mt&&(f=Number(t&o),f>=n&&(f-=r),t-=BigInt(f)),s.push(f),t>>=Mt}return s}function Cr(t,e,r){let n=2**e,o=n/2,s=BigInt(n-1),f=BigInt(e),c=[];for(let i=0;i<r;i++){let a=Number(t&s);t>>=f,a>o&&(a-=n,t+=Mt),c.push(a)}if(t!==ke)throw new Error("invalid wnaf");return c}function Fr(t,e,r){let n=0;for(let s of r)n=Math.max(n,s.length);let o=t;for(let s=n-1;s>=0;s--){s!==n-1&&(o=o.double());for(let f=0;f<r.length;f++){let c=r[f][s];if(c){let i=e[f][Math.abs(c)-1>>1];o=o.add(c<0?i.negate():i)}}}return o}var ae=class{constructor(e,r){w(this,"Point");w(this,"BASE");w(this,"ZERO");w(this,"randomBytes");w(this,"wnafPrecomputes",new WeakMap);w(this,"baseCanBeBlinded");w(this,"bits");Ut(e),this.randomBytes=Me(r,De),this.Point=e,this.BASE=e.BASE,this.ZERO=e.ZERO,this.bits=e.Fn.BITS}buildWnafTable(e,r,n){let o=Math.ceil(n/r)+1,s=2**(r-1),f=[],c=e;for(let i=0;i<o;i++){let a=c;for(let u=0;u<s;u++)f.push(a),a=a.add(c);c=f[f.length-1].double()}return{W:r,bits:n,windows:o,comp:f}}wnafCachedCT(e,r){let{W:n,windows:o,comp:s}=e,f=2**(n-1),c=Cr(r,n,o),i=this.ZERO,a=this.BASE;for(let u=0;u<o;u++){let l=c[u],p=u*f,g=Math.abs(l)-1,y=s[p];for(let A=1;A<f;A++)y=A===g?s[p+A]:y;let S=y.negate();l===0?a=a.add(s[p]):i=i.add(l<0?S:y)}return{p:i,f:a}}getWnafPrecomputes(e,r,n,o){let s=this.wnafPrecomputes.get(r),f=s?.find(c=>c.W===e&&c.bits===n);return f||(f=this.buildWnafTable(r,e,n),typeof o=="function"&&(f={...f,comp:o(f.comp)}),s||(s=[],this.wnafPrecomputes.set(r,s)),s.push(f)),f}assertPoint(e){if(!(e instanceof this.Point))throw new TypeError('"point" expected Point instance, got type='+typeof e)}validateMulInput(e,r){if(this.assertPoint(e),!Re(r,Mt,this.Point.Fn.ORDER))throw new Error("invalid scalar")}runCT(e,r,n,o){let s=Ne(e);return s===1?this.fixedWindowCT(e,r,n):this.wnafCachedCT(this.getWnafPrecomputes(s,e,n,o),r)}mulCT(e,r,n){return this.validateMulInput(e,r),this.runCT(e,r,this.bits,n)}mulCTBlinded(e,r,n){if(this.validateMulInput(e,r),this.randomBytes===void 0)throw new Error("randomBytes is required for scalar blinding");let o=this.Point.Fn.BITS+Un,s=this.randomBytes(De);if(!Ot(s)||s.length!==De)throw new Error("randomBytes returned invalid byte array");s[0]=s[0]&63|128;let f=r+nt(s)*this.Point.Fn.ORDER;return this.runCT(e,f,o,n)}fixedWindowCT(e,r,n){let o=Lr,s=1<<o,f=kt(o),c=new Array(s);c[0]=this.ZERO;for(let u=1;u<s;u++)c[u]=c[u-1].add(e);let i=Math.ceil(n/o),a=this.ZERO;for(let u=i-1;u>=0;u--){if(u!==i-1)for(let g=0;g<o;g++)a=a.double();let l=Number(r>>BigInt(u*o)&f),p=c[0];for(let g=1;g<s;g++)p=g===l?c[g]:p;a=a.add(p)}return{p:a,f:a}}shouldBlind(e,r){return this.randomBytes===void 0?!1:r===Mt?!0:e!==this.BASE?!1:(this.baseCanBeBlinded===void 0&&(this.baseCanBeBlinded=this.mulUnsafe(this.BASE,this.Point.Fn.ORDER).is0()),this.baseCanBeBlinded)}mulSecret(e,r,n,o){return this.shouldBlind(e,n)?this.mulCTBlinded(e,r,o):this.mulCT(e,r,o)}mulUnsafe(e,r,n){if(this.assertPoint(e),!lt(r))throw new Error("invalid scalar");let o=Ne(e);if(o===1||r>=this.Point.Fn.ORDER)return ue(this.Point,[e],[r],!0);let s=this.getWnafPrecomputes(o,e,this.bits,n);return this.wnafCachedCT(s,r).p}setWindowSize(e,r){this.assertPoint(e),Rr(r,this.bits);let n=Math.ceil((this.bits+Un)/r)+1;Ur(n*2**(r-1),this.Point.Fp.BYTES),Fn.set(e,r),this.wnafPrecomputes.delete(e)}hasWindowSize(e){return Ne(e)!==1}};function ue(t,e,r,n=!1){if(Ut(t),Cn(e,t),et(n,"allowOversized"),_r(r,t.Fn,n?t.Fn.ORDER**Or:void 0),e.length!==r.length)throw new Error("arrays of points and scalars must have equal length");let o=e.map(f=>Ir(f,4)),s=r.map(f=>Hr(f,4));return Fr(t.ZERO,o,s)}function In(t,e,r){if(e){if(e.ORDER!==t)throw new Error("Field.ORDER must match order: Fp == p, Fn == n");return Rt(e),e}else return fe(t,{isLE:r})}function Dn(t,e,r={},n){if(t!=="weierstrass"&&t!=="edwards")throw new Error('expected curve type "weierstrass" or "edwards"');if(n===void 0&&(n=t==="edwards"),!e||typeof e!="object")throw new Error(`expected valid ${t} CURVE object`);ht(r);for(let i of["p","n","h"]){let a=e[i];if(!(lt(a)&&a!==ke))throw new Error(`CURVE.${i} must be positive bigint`)}let o=In(e.p,r.Fp,n),s=In(e.n,r.Fn,n),c=["Gx","Gy","a",t==="weierstrass"?"b":"d"];for(let i of c)if(!o.isValid(e[i]))throw new Error(`CURVE.${i} must be valid field element of CURVE.Fp`);return e=Object.freeze(Object.assign({},e)),{CURVE:e,Fp:o,Fn:s}}function Nn(t,e){return function(n){let o=t(n);return{secretKey:o,publicKey:e(o)}}}var de=class{constructor(e,r){w(this,"oHash");w(this,"iHash");w(this,"blockLen");w(this,"outputLen");w(this,"canXOF",!1);w(this,"finished",!1);w(this,"destroyed",!1);if(yt(e),$(r,void 0,"key"),this.iHash=e.create(),typeof this.iHash.update!="function")throw new Error("expected Hash instance");this.blockLen=this.iHash.blockLen,this.outputLen=this.iHash.outputLen;let n=this.blockLen,o=new Uint8Array(n);o.set(r.length>n?e.create().update(r).digest():r);for(let s=0;s<o.length;s++)o[s]^=54;this.iHash.update(o),this.oHash=e.create();for(let s=0;s<o.length;s++)o[s]^=106;this.oHash.update(o),tt(o)}update(e){return St(this),this.iHash.update(e),this}digestInto(e){St(this),Gt(e,this),this.finished=!0;let r=e.subarray(0,this.outputLen);this.iHash.digestInto(r),this.oHash.update(r),this.oHash.digestInto(r),this.destroy()}digest(){let e=new Uint8Array(this.oHash.outputLen);return this.digestInto(e),e}_cloneInto(e){e||(e=Object.create(Object.getPrototypeOf(this),{}));let{oHash:r,iHash:n,finished:o,destroyed:s,blockLen:f,outputLen:c,canXOF:i}=this;return e=e,e.finished=o,e.destroyed=s,e.blockLen=f,e.outputLen=c,e.canXOF=i,e.oHash=r._cloneInto(e.oHash),e.iHash=n._cloneInto(e.iHash),e}clone(){return this._cloneInto()}destroy(){this.destroyed=!0,this.oHash.destroy(),this.iHash.destroy()}},jt=(()=>{let t=((e,r,n)=>new de(e,r).update(n).digest());return t.create=(e,r)=>new de(e,r),t})();/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var Dr=BigInt(0),je=class extends Error{constructor(e=""){super(e)}},st={Err:je,_tlv:{encode:(t,e)=>{let{Err:r}=st;if(mt(t,"tag"),t<0||t>255)throw new r("tlv.encode: wrong tag");if(gn(e,"data"),e.length&1)throw new r("tlv.encode: unpadded data");let n=e.length/2,o=Nt(n);if(o.length/2&128)throw new r("tlv.encode: long form length too big");let s=n>127?Nt(o.length/2|128):"";return Nt(t)+s+o+e},decode(t,e){let{Err:r}=st;e=N(e,void 0,"DER data");let n=0;if(t<0||t>255)throw new r("tlv.decode: wrong tag");if(e.length<2||e[n++]!==t)throw new r("tlv.decode: wrong tlv");let o=e[n++],s=!!(o&128),f=0;if(!s)f=o;else{let i=o&127;if(!i)throw new r("tlv.decode(long): indefinite length not supported");if(i>4)throw new r("tlv.decode(long): byte length is too big");let a=e.subarray(n,n+i);if(a.length!==i)throw new r("tlv.decode: length bytes not complete");if(a[0]===0)throw new r("tlv.decode(long): zero leftmost byte");for(let u of a)f=f<<8|u;if(n+=i,f<128)throw new r("tlv.decode(long): not minimal encoding")}let c=e.subarray(n,n+f);if(c.length!==f)throw new r("tlv.decode: wrong value length");return{v:c,l:e.subarray(n+f)}}},_int:{encode(t){let{Err:e}=st;if(oe(t),t<Dr)throw new e("integer: negative integers are not allowed");let r=Nt(t);if(Number.parseInt(r[0],16)&8&&(r="00"+r),r.length&1)throw new e("unexpected DER parsing assertion: unpadded hex");return r},decode(t){let{Err:e}=st;if(t.length<1)throw new e("invalid signature integer: empty");if(t[0]&128)throw new e("invalid signature integer: negative");if(t.length>1&&t[0]===0&&!(t[1]&128))throw new e("invalid signature integer: unnecessary leading zero");return nt(t)}},toSig(t,e){let{Err:r,_int:n,_tlv:o}=st;if(e!==void 0&&(mt(e,"maxScalarBytes"),e<1))throw new r("invalid signature: maxScalarBytes must be positive");let s=N(t,void 0,"signature"),{v:f,l:c}=o.decode(48,s);if(c.length)throw new r("invalid signature: left bytes after parsing");let{v:i,l:a}=o.decode(2,f),{v:u,l}=o.decode(2,a);if(l.length)throw new r("invalid signature: left bytes after parsing");if(e!==void 0&&(i.length>e||u.length>e))throw new r("invalid signature: integer too large");return{r:n.decode(i),s:n.decode(u)}},hexFromSig(t){let{_tlv:e,_int:r}=st;ht(t,{r:"bigint",s:"bigint"},{},"sig");let n=e.encode(2,r.encode(t.r)),o=e.encode(2,r.encode(t.s)),s=n+o;return e.encode(48,s)}},le=(Object.freeze(st._tlv),Object.freeze(st._int),Object.freeze(st));/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var kn=(t,e)=>(t+(t>=0?e:-e)/Mn)/e;function Nr(t,e,r){Ue("scalar",t,it,r);let[[n,o],[s,f]]=e,c=kn(f*t,r),i=kn(-o*t,r),a=t-c*n-i*s,u=-c*o-i*f,l=a<it,p=u<it;l&&(a=-a),p&&(u=-u);let g=kt(Math.ceil(Lt(r)/2))+Et;if(a<it||a>=g||u<it||u>=g)throw new Error("splitScalar (endomorphism): failed for k");return{k1neg:l,k1:a,k2neg:p,k2:u}}function ze(t){if(!["compact","recovered","der"].includes(t))throw new Error('Signature format must be "compact", "recovered", or "der"');return t}function qe(t,e){ht(t);let r={};for(let n of Object.keys(e))r[n]=t[n]===void 0?e[n]:t[n];return et(r.lowS,"lowS"),et(r.prehash,"prehash"),r.format!==void 0&&ze(r.format),r}var it=BigInt(0),Et=BigInt(1),Mn=BigInt(2),Pe=BigInt(3),kr=BigInt(4);function jn(t,e={}){let r=Dn("weierstrass",t,e),n=r.Fp,o=r.Fn,s=r.CURVE,{h:f,n:c}=s;ht(e,{},{allowInfinityPoint:"boolean",clearCofactor:"function",isTorsionFree:"function",fromBytes:"function",toBytes:"function",endo:"object",randomBytes:"function"});let{endo:i,allowInfinityPoint:a,clearCofactor:u,isTorsionFree:l,fromBytes:p,toBytes:g}=e,y=e.randomBytes===void 0?re:e.randomBytes;if(i&&(!n.is0(s.a)||typeof i.beta!="bigint"||!Array.isArray(i.basises)))throw new Error('invalid endo: expected "beta": bigint and "basises": array');let S=i?{beta:i.beta,basises:i.basises.map(h=>[...h])}:void 0,A=Pn(n,o);function L(){if(!n.isOdd)throw new Error("compression is not supported: Field does not have .isOdd()")}function R(h,d,b){if(d.is0()){if(!a)throw new Error("bad point: ZERO");return Uint8Array.of(0)}let{x,y:B}=d.toAffine(),v=n.toBytes(x);if(et(b,"isCompressed"),b){L();let m=!n.isOdd(B);return ot(qn(m),v)}else return ot(Uint8Array.of(4),v,n.toBytes(B))}function z(h){N(h,void 0,"Point");let{publicKey:d,publicKeyUncompressed:b}=A,x=h.length,B=h[0],v=h.subarray(1);if(a&&x===1&&B===0)return{x:n.ZERO,y:n.ZERO};if(x===d&&(B===2||B===3)){let m=n.fromBytes(v);if(!n.isValid(m))throw new Error("bad point: is not on curve, wrong x");let O=gt(m),T;try{T=n.sqrt(O)}catch(H){let D=H instanceof Error?": "+H.message:"";throw new Error("bad point: is not on curve, sqrt error"+D)}L();let _=n.isOdd(T);return(B&1)===1!==_&&(T=n.neg(T)),{x:m,y:T}}else if(x===b&&B===4){let m=n.BYTES,O=n.fromBytes(v.subarray(0,m)),T=n.fromBytes(v.subarray(m,m*2));if(!ct(O,T))throw new Error("bad point: is not on curve");return{x:O,y:T}}else throw new Error(`bad point: got length ${x}, expected compressed=${d} or uncompressed=${b}`)}let k=g===void 0?R:g,Q=p===void 0?z:p,J=n.mul(s.b,Pe),V=n.is0(s.a)?h=>n.ZERO:h=>n.mul(s.a,h);function gt(h){let d=n.sqr(h),b=n.mul(d,h);return n.add(n.add(b,n.mul(h,s.a)),s.b)}function ct(h,d){let b=n.sqr(d),x=gt(h);return n.eql(b,x)}if(!ct(s.Gx,s.Gy))throw new Error("bad curve params: generator point");let K=n.mul(n.pow(s.a,Pe),kr),Kt=n.mul(n.sqr(s.b),BigInt(27));if(n.is0(n.add(K,Kt)))throw new Error("bad curve params: a or b");function bt(h,d,b=!1){if(!n.isValid(d)||b&&n.is0(d))throw new Error(`bad point coordinate ${h}`);return typeof d=="object"&&d!==null?n.create(d):d}function vt(h){if(!(h instanceof Y))throw new Error("Weierstrass Point expected")}function $t(h){if(!S||!S.basises)throw new Error("no endo");return Nr(h,S.basises,o.ORDER)}function wt(h,d,b,x){if(!o.isValid(x))throw new RangeError("invalid scalar: out of range");if(S){let{k1neg:B,k1:v,k2neg:m,k2:O}=$t(x),T=new Y(n.mul(b.X,S.beta),b.Y,b.Z);h.push(B?b.negate():b,m?T.negate():T),d.push(v,O)}else h.push(b),d.push(x)}let Wt=new WeakSet,E=class E{constructor(d,b,x){w(this,"X");w(this,"Y");w(this,"Z");this.X=bt("x",d),this.Y=bt("y",b,!0),this.Z=bt("z",x),Object.freeze(this)}static CURVE(){return s}static fromAffine(d){let{x:b,y:x}=d||{};if(!d||!n.isValid(b)||!n.isValid(x))throw new Error("invalid affine point");if(d instanceof E)throw new Error("projective point not allowed");return n.is0(b)&&n.is0(x)?E.ZERO:new E(b,x,n.ONE)}static fromBytes(d){let b=E.fromAffine(Q(N(d,void 0,"point")));return b.assertValidity(),b}static fromHex(d){return E.fromBytes(ne(d))}get x(){return this.toAffine().x}get y(){return this.toAffine().y}precompute(d=6,b=!0){return at.setWindowSize(this,d),b||this.multiply(Pe),this}assertValidity(){let d=this;if(d.is0()){if(a&&n.is0(d.X)&&n.eql(d.Y,n.ONE)&&n.is0(d.Z))return;throw new Error("bad point: ZERO")}if(Wt.has(d))return;let{x:b,y:x}=d.toAffine();if(!n.isValid(b)||!n.isValid(x))throw new Error("bad point: x or y not field elements");if(!ct(b,x))throw new Error("bad point: equation left != right");if(!d.isTorsionFree())throw new Error("bad point: not in prime-order subgroup");Wt.add(d)}hasEvenY(){let{y:d}=this.toAffine();if(!n.isOdd)throw new Error("Field doesn't support isOdd");return!n.isOdd(d)}equals(d){vt(d);let{X:b,Y:x,Z:B}=this,{X:v,Y:m,Z:O}=d,T=n.eql(n.mul(b,O),n.mul(v,B)),_=n.eql(n.mul(x,O),n.mul(m,B));return T&&_}negate(){return new E(this.X,n.neg(this.Y),this.Z)}double(){let{X:d,Y:b,Z:x}=this,B=n.ZERO,v=n.ZERO,m=n.ZERO,O=n.mul(d,d),T=n.mul(b,b),_=n.mul(x,x),U=n.mul(d,b);return U=n.add(U,U),m=n.mul(d,x),m=n.add(m,m),B=V(m),v=n.mul(J,_),v=n.add(B,v),B=n.sub(T,v),v=n.add(T,v),v=n.mul(B,v),B=n.mul(U,B),m=n.mul(J,m),_=V(_),U=n.sub(O,_),U=V(U),U=n.add(U,m),m=n.add(O,O),O=n.add(m,O),O=n.add(O,_),O=n.mul(O,U),v=n.add(v,O),_=n.mul(b,x),_=n.add(_,_),O=n.mul(_,U),B=n.sub(B,O),m=n.mul(_,T),m=n.add(m,m),m=n.add(m,m),new E(B,v,m)}add(d){vt(d);let{X:b,Y:x,Z:B}=this,{X:v,Y:m,Z:O}=d,T=n.ZERO,_=n.ZERO,U=n.ZERO,H=n.mul(b,v),D=n.mul(x,m),j=n.mul(B,O),P=n.add(b,x),C=n.add(v,m);P=n.mul(P,C),C=n.add(H,D),P=n.sub(P,C),C=n.add(b,B);let Z=n.add(v,O);return C=n.mul(C,Z),Z=n.add(H,j),C=n.sub(C,Z),Z=n.add(x,B),T=n.add(m,O),Z=n.mul(Z,T),T=n.add(D,j),Z=n.sub(Z,T),U=V(C),T=n.mul(J,j),U=n.add(T,U),T=n.sub(D,U),U=n.add(D,U),_=n.mul(T,U),D=n.add(H,H),D=n.add(D,H),j=V(j),C=n.mul(J,C),D=n.add(D,j),j=n.sub(H,j),j=V(j),C=n.add(C,j),H=n.mul(D,C),_=n.add(_,H),H=n.mul(Z,C),T=n.mul(P,T),T=n.sub(T,H),H=n.mul(P,D),U=n.mul(Z,U),U=n.add(U,H),new E(T,_,U)}subtract(d){return vt(d),this.add(d.negate())}is0(){return this.equals(E.ZERO)}multiply(d){if(!o.isValidNot0(d))throw new RangeError("invalid scalar: out of range");let{p:b,f:x}=at.mulSecret(this,d,f,Ft);return Ft([b,x])[0]}multiplyUnsafe(d){let b=this,x=d;if(!o.isValid(x))throw new RangeError("invalid scalar: out of range");if(x===it||b.is0())return E.ZERO;if(x===Et)return b;if(at.hasWindowSize(this))return at.mulUnsafe(b,x,Ft);let B=[],v=[];return wt(B,v,b,x),ue(E,B,v)}mulAddUnsafe(d,b,x){vt(b);let B=[],v=[];return wt(B,v,this,d),wt(B,v,b,x),ue(E,B,v)}toAffine(d){let b=this,x=d;if(x!=null&&!n.isValid(x))throw new RangeError('"invertedZ" expected valid field element');let{X:B,Y:v,Z:m}=b;if(n.eql(m,n.ONE))return{x:B,y:v};let O=b.is0();x==null&&(x=O?n.ONE:n.inv(m));let T=n.mul(B,x),_=n.mul(v,x),U=n.mul(m,x);if(O)return{x:n.ZERO,y:n.ZERO};if(!n.eql(U,n.ONE))throw new Error("invZ was invalid");return{x:T,y:_}}isTorsionFree(){return f===Et?!0:l?l(E,this):at.mulUnsafe(this,c).is0()}clearCofactor(){return f===Et?this:u?u(E,this):this.multiplyUnsafe(f)}isSmallOrder(){return f===Et?this.is0():this.clearCofactor().is0()}toBytes(d=!0){return et(d,"isCompressed"),this.assertValidity(),k(E,this,d)}toHex(d=!0){return Te(this.toBytes(d))}toString(){return`<Point ${this.is0()?"ZERO":this.toHex()}>`}};w(E,"BASE",new E(s.Gx,s.Gy,n.ONE)),w(E,"ZERO",new E(n.ZERO,n.ONE,n.ZERO)),w(E,"Fp",n),w(E,"Fn",o);let Y=E,Ft=h=>Hn(Y,h),at=new ae(Y,y);return at.bits>=6&&Y.BASE.precompute(6),Object.freeze(Y.prototype),Object.freeze(Y),Y}function qn(t){return Uint8Array.of(t?2:3)}function Pn(t,e){return{secretKey:e.BYTES,publicKey:1+t.BYTES,publicKeyUncompressed:1+2*t.BYTES,publicKeyHasPrefix:!0,signature:2*e.BYTES}}function Mr(t,e={}){Ut(t);let{Fn:r}=t,n=e.randomBytes===void 0?re:e.randomBytes,o=Object.assign(Pn(t.Fp,r),{seed:Math.max(ce(r.ORDER),16)});function s(g){try{let y=r.fromBytes(g);return r.isValidNot0(y)}catch{return!1}}function f(g,y){let{publicKey:S,publicKeyUncompressed:A}=o;try{let L=g.length;return y===!0&&L!==S||y===!1&&L!==A?!1:!t.fromBytes(g).is0()}catch{return!1}}function c(g){return g=g===void 0?n(o.seed):g,Fe(N(g,o.seed,"seed"),r.ORDER)}function i(g,y=!0){return t.BASE.multiply(r.fromBytes(g)).toBytes(y)}function a(g){let{secretKey:y,publicKey:S,publicKeyUncompressed:A}=o,L=r._lengths;if(!Ot(g))return;let R=N(g,void 0,"key").length,z=R===S||R===A,k=R===y||!!L?.includes(R);if(!(z&&k))return z}function u(g,y,S=!0){if(a(g)===!0)throw new Error("first arg must be private key");if(a(y)===!1)throw new Error("second arg must be public key");let A=r.fromBytes(g),L=t.fromBytes(y);if(L.is0())throw new Error("invalid public key: point at infinity");return L.multiply(A).toBytes(S)}let l={isValidSecretKey:s,isValidPublicKey:f,randomSecretKey:c},p=Nn(c,i);return Object.freeze(l),Object.freeze(o),Object.freeze({getPublicKey:i,getSharedSecret:u,keygen:p,Point:t,utils:l,lengths:o})}function zn(t,e,r={}){Ut(t);let n=e;yt(n),ht(r,{},{hmac:"function",lowS:"boolean",randomBytes:"function",bits2int:"function",bits2int_modN:"function"});let o=Object.assign({},r),s=o.randomBytes===void 0?re:o.randomBytes,f=o.hmac===void 0?(E,h)=>jt(n,E,h):o.hmac,{Fp:c,Fn:i}=t,{ORDER:a,BITS:u}=i,l=ce(a),p=Me(s,l),{keygen:g,getPublicKey:y,getSharedSecret:S,utils:A,lengths:L}=Mr(t,o),R={prehash:!0,lowS:typeof o.lowS=="boolean"?o.lowS:!0,format:"compact",extraEntropy:!1},z=a*Mn+Et<c.ORDER;function k(E){let h=a>>Et;return E>h}function Q(E,h){if(!i.isValidNot0(h))throw new Error(`invalid signature ${E}: out of range 1..Point.Fn.ORDER`);return h}function J(){if(!c.isOdd)throw new Error("Field doesn't support isOdd")}function V(E,h,d){return J(),(E===d?0:2)|Number(c.isOdd(h))}function gt(){if(z)throw new Error('"recovered" sig type is not supported for cofactor >2 curves')}function ct(E,h){ze(h);let d=L.signature,b=h==="compact"?d:h==="recovered"?d+1:void 0;return N(E,b)}class K{constructor(h,d,b){w(this,"r");w(this,"s");w(this,"recovery");if(this.r=Q("r",h),this.s=Q("s",d),b!=null){if(gt(),![0,1,2,3].includes(b))throw new Error("invalid recovery id");this.recovery=b}Object.freeze(this)}static fromBytes(h,d=R.format){ct(h,d);let b;if(d==="der"){if(h.length>2*i.BYTES+16)throw new le.Err("invalid signature: DER signature too long");let{r:m,s:O}=le.toSig(N(h),i.BYTES+1);return new K(m,O)}d==="recovered"&&(b=h[0],d="compact",h=h.subarray(1));let x=L.signature/2,B=h.subarray(0,x),v=h.subarray(x,x*2);return new K(i.fromBytes(B),i.fromBytes(v),b)}static fromHex(h,d){return this.fromBytes(ne(h),d)}assertRecovery(){let{recovery:h}=this;if(h==null)throw new Error("invalid recovery id: must be present");return h}addRecoveryBit(h){return new K(this.r,this.s,h)}recoverPublicKey(h){let{r:d,s:b}=this,x=this.assertRecovery(),B=x===2||x===3?d+a:d;if(!c.isValid(B))throw new Error("invalid recovery id: sig.r+curve.n != R.x");let v=c.toBytes(B),m=t.fromBytes(ot(qn((x&1)===0),v)),O=i.inv(B),T=bt(N(h,void 0,"msgHash")),_=i.create(-T*O),U=i.create(b*O),H=t.BASE.mulAddUnsafe(_,m,U);if(H.is0())throw new Error("invalid recovery: point at infinify");return H.assertValidity(),H}hasHighS(){return k(this.s)}toBytes(h=R.format){if(ze(h),h==="der")return ne(le.hexFromSig(this));let{r:d,s:b}=this,x=i.toBytes(d),B=i.toBytes(b);return h==="recovered"?(gt(),ot(Uint8Array.of(this.assertRecovery()),x,B)):ot(x,B)}toHex(h){return Te(this.toBytes(h))}}Object.freeze(K.prototype),Object.freeze(K);let Kt=o.bits2int===void 0?function(h){if(h.length>8192)throw new Error("input is too large");let d=nt(h),b=h.length*8-u;return b>0?d>>BigInt(b):d}:o.bits2int,bt=o.bits2int_modN===void 0?function(h){return i.create(Kt(h))}:o.bits2int_modN,vt=kt(u);function $t(E){return Ue("num < 2^"+u,E,it,vt),i.toBytes(E)}function wt(E,h){return N(E,void 0,"message"),h?N(n(E),void 0,"prehashed message"):E}function Wt(E,h,d){let{lowS:b,prehash:x,extraEntropy:B}=qe(d,R);E=wt(E,x);let v=bt(E),m=i.fromBytes(h);if(!i.isValidNot0(m))throw new Error("invalid private key");let O=[$t(m),$t(v)];if(B!=null&&B!==!1){let H=B===!0?s(L.secretKey):B;O.push(N(H,void 0,"extraEntropy"))}let T=ot(...O),_=v;function U(H){let D=Kt(H);if(!i.isValidNot0(D))return;let j=t.BASE.multiply(D).toAffine(),P=i.create(j.x);if(P===it)return;let C;if(p!==void 0){let Dt=nt(Fe(p(l),a)),tr=i.inv(i.mul(Dt,D)),er=i.mul(Dt,_),nr=i.mul(Dt,m);C=i.create(tr*i.create(er+nr*P))}else{let Dt=Tn(D,a);C=i.create(Dt*i.create(_+P*m))}if(C===it)return;let Z=V(j.x,j.y,P),en=C;return b&&k(C)&&(en=i.neg(C),Z^=1),new K(P,en,z?void 0:Z)}return{seed:T,k2sig:U}}function Y(E,h,d={}){let{seed:b,k2sig:x}=Wt(E,h,d);return wn(n.outputLen,i.BYTES,f)(b,x).toBytes(d.format)}function Ft(E,h,d,b={}){let{lowS:x,prehash:B,format:v}=qe(b,R);if(d=N(d,void 0,"publicKey"),h=wt(h,B),!Ot(E)){let m=E instanceof K?", use sig.toBytes()":"";throw new Error("verify expects Uint8Array signature"+m)}ct(E,v);try{let m=K.fromBytes(E,v),O=t.fromBytes(d);if(O.is0()||x&&m.hasHighS())return!1;let{r:T,s:_}=m,U=bt(h),H=i.inv(_),D=i.create(U*H),j=i.create(T*H),P=t.BASE.mulAddUnsafe(D,O,j);if(P.is0())return!1;let C=P.toAffine();return!(i.create(C.x)!==T||v==="recovered"&&m.recovery!==V(C.x,C.y,T))}catch{return!1}}function at(E,h,d={}){let{prehash:b}=qe(d,R);return h=wt(h,b),K.fromBytes(E,"recovered").recoverPublicKey(h).toBytes()}return Object.freeze({keygen:g,getPublicKey:y,getSharedSecret:S,utils:A,lengths:L,Point:t,sign:Y,verify:Ft,recoverPublicKey:at,Signature:K,hash:n})}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var jr={p:BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"),n:BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"),h:BigInt(1),a:BigInt("0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc"),b:BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b"),Gx:BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),Gy:BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")};var qr=jn(jr),_t=zn(qr,Tt);var qt=Uint8Array.of(0),Pr=Uint8Array.of();function zr(t,e,r,n=32,o){yt(t),G(n,"length"),$(e,void 0,"prk");let s=t.outputLen;if(e.length<s)throw new Error('"prk" must be at least HashLen octets');if(n>255*s)throw new Error("Length must be <= 255*HashLen");let f=Math.ceil(n/s);if(r===void 0?r=Pr:$(r,void 0,"info"),!f)return o&&tt(e),new Uint8Array;let c=o&&f===1?e:new Uint8Array(f*s),{iHash:i,oHash:a}=jt.create(t,e),u=o?e:new Uint8Array(s),l=f>1?o?.iHash||t.create():void 0;for(let g=0;g<f-1;g++){qt[0]=g+1;let y=i._cloneInto(l);g&&y.update(u),y.update(r).update(qt).digestInto(u),a._cloneInto(l).update(u).digestInto(u),c.set(u,s*g)}if(qt[0]=f,f>1&&i.update(u),i.update(r).update(qt).digestInto(u),a.update(u).digestInto(u),c.set(u,s*(f-1)),i.destroy(),a.destroy(),l?.destroy(),u!==c&&tt(u),tt(qt),n===c.length)return c;let p=c.slice(0,n);return tt(c),p}var he=(t,e,r,n,o)=>{yt(t),r===void 0&&(r=new Uint8Array(t.outputLen));let s=jt.create(t,r).update(e);return zr(t,s.digest(),n,o,s)};/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */function Ze(t){return t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array"&&"BYTES_PER_ELEMENT"in t&&t.BYTES_PER_ELEMENT===1}var pe=t=>t?`"${t}" `:"";function Zr(t,e=""){if(typeof t!="boolean")throw new TypeError(pe(e)+"expected boolean, got type="+typeof t);return t}function ge(t,e=""){if(typeof t!="number")throw new TypeError(pe(e)+"expected number, got "+typeof t);if(!Number.isSafeInteger(t)||t<0)throw new RangeError(pe(e)+"expected integer >= 0, got "+t);return t}function M(t,e,r=""){if(Ze(t)&&(e===void 0||t.length===e))return t;e!==void 0&&ge(e,"length");let n=Ze(t),o=e!==void 0?` of length ${e}`:"",s=n?`length=${t.length}`:`type=${typeof t}`,f=pe(r)+"expected Uint8Array"+o+", got "+s;throw n?new RangeError(f):new TypeError(f)}function be(t,e=!0){if(t.destroyed)throw new Error("hash was destroyed");if(e&&t.finished)throw new Error("digest() was already called")}function Kr(t,e){M(t,void 0,"output");let r=e.outputLen;if(!(t.length>=r))throw new RangeError('"output" expected length >= '+r)}function Ke(t,e){if(Kr(t,e),!Ct(t))throw new Error("invalid output, must be aligned")}function Zn(t){return new Uint8Array(t.buffer,t.byteOffset,t.byteLength)}function ft(t){return new Uint32Array(t.buffer,t.byteOffset,Math.floor(t.byteLength/4))}function rt(...t){for(let e=0;e<t.length;e++)t[e].fill(0)}function It(t){return new DataView(t.buffer,t.byteOffset,t.byteLength)}var Ht=new Uint8Array(new Uint32Array([287454020]).buffer)[0]===68;function $e(t){return t<<24&4278190080|t<<8&16711680|t>>>8&65280|t>>>24&255}var F=Ht?t=>t:t=>$e(t)>>>0;function $r(t){for(let e=0;e<t.length;e++)t[e]=$e(t[e]);return t}var Pt=Ht?t=>t:$r;function Kn(t,e){if(t=M(t),e=M(e),t.length!==e.length)return!1;let r=0;for(let n=0;n<t.length;n++)r|=t[n]^e[n];return r===0}function We(t,e,r){let n=e,o=r||(()=>[]),s=(c,i)=>n(i,...o(c)).update(c).digest(),f=n(new Uint8Array(t),...o(new Uint8Array(0)));return s.outputLen=f.outputLen,s.blockLen=f.blockLen,s.create=(c,...i)=>n(c,...i),s}var $n=(t,e)=>{function r(n,...o){if(M(n,void 0,"key"),t.nonceLength!==void 0){let l=o[0];M(l,t.varSizeNonce?void 0:t.nonceLength,"nonce")}let s=t.tagLength,f=t.nonceLength!==void 0?1:0;if(!t.withAAD){for(let l=f;l<o.length;l++)if(Ze(o[l]))throw new Error("AAD not supported")}t.withAAD&&o[f]!==void 0&&M(o[f],void 0,"AAD");let c=e(n,...o),i=(l,p)=>{if(p!==void 0){if(l!==2)throw new Error("cipher output not supported");M(p,void 0,"output")}},a=!1;return{encrypt(l,p){if(a)throw new Error("cannot encrypt() twice with same key + nonce");return a=!0,M(l,void 0,"data"),i(c.encrypt.length,p),c.encrypt(l,p)},decrypt(l,p){if(M(l,void 0,"data"),s&&l.length<s)throw new Error('"ciphertext" expected length >= tagLength='+s);return i(c.decrypt.length,p),c.decrypt(l,p)}}}return Object.assign(r,t),r};function Wn(t,e,r=!0){if(e===void 0)return new Uint8Array(t);if(M(e,t,"output"),r&&!Ct(e))throw new Error("invalid output, must be aligned");return e}function Yn(t,e,r){ge(t),ge(e),Zr(r);let n=new Uint8Array(16),o=It(n);return o.setBigUint64(0,BigInt(e),r),o.setBigUint64(8,BigInt(t),r),n}function Ct(t){return t.byteOffset%4===0}function Bt(t){return Uint8Array.from(M(t))}var At=16,Vn=new Uint8Array(16),zt=ft(Vn),Wr=225,Yr=(t,e,r,n)=>{let o=n&1;return{s3:r<<31|n>>>1,s2:e<<31|r>>>1,s1:t<<31|e>>>1,s0:t>>>1^Wr<<24&-(o&1)}},we=t=>(t>>>0&255)<<24|(t>>>8&255)<<16|(t>>>16&255)<<8|t>>>24&255|0;var Vr=t=>t>64*1024?8:t>1024?4:2,Ye=class{constructor(e,r){w(this,"blockLen",At);w(this,"outputLen",At);w(this,"s0",0);w(this,"s1",0);w(this,"s2",0);w(this,"s3",0);w(this,"finished",!1);w(this,"destroyed",!1);w(this,"t");w(this,"W");w(this,"windowSize");M(e,16,"key"),e=Bt(e);let n=It(e),o=n.getUint32(0,!1),s=n.getUint32(4,!1),f=n.getUint32(8,!1),c=n.getUint32(12,!1),i=[];for(let y=0;y<128;y++)i.push({s0:we(o),s1:we(s),s2:we(f),s3:we(c)}),{s0:o,s1:s,s2:f,s3:c}=Yr(o,s,f,c);let a=Vr(r||1024);if(![1,2,4,8].includes(a))throw new Error("ghash: invalid window size, expected 2, 4 or 8");this.W=a;let l=128/a,p=this.windowSize=2**a,g=[];for(let y=0;y<l;y++)for(let S=0;S<p;S++){let A=0,L=0,R=0,z=0;for(let k=0;k<a;k++){if(!(S>>>a-k-1&1))continue;let{s0:J,s1:V,s2:gt,s3:ct}=i[a*y+k];A^=J,L^=V,R^=gt,z^=ct}g.push({s0:A,s1:L,s2:R,s3:z})}this.t=g}_updateBlock(e,r,n,o){e^=this.s0,r^=this.s1,n^=this.s2,o^=this.s3;let{W:s,t:f,windowSize:c}=this,i=0,a=0,u=0,l=0,p=(1<<s)-1,g=0;for(let y of[e,r,n,o])for(let S=0;S<4;S++){let A=y>>>8*S&255;for(let L=8/s-1;L>=0;L--){let R=A>>>s*L&p,{s0:z,s1:k,s2:Q,s3:J}=f[g*c+R];i^=z,a^=k,u^=Q,l^=J,g+=1}}this.s0=i,this.s1=a,this.s2=u,this.s3=l}update(e){be(this),M(e),e=Bt(e);let r=ft(e),n=Math.floor(e.length/At),o=e.length%At;for(let s=0;s<n;s++)this._updateBlock(F(r[s*4+0]),F(r[s*4+1]),F(r[s*4+2]),F(r[s*4+3]));return o&&(Vn.set(e.subarray(n*At)),this._updateBlock(F(zt[0]),F(zt[1]),F(zt[2]),F(zt[3])),rt(zt)),this}destroy(){this.destroyed=!0;let{t:e}=this;for(let r of e)r.s0=0,r.s1=0,r.s2=0,r.s3=0}digestInto(e){be(this),Ke(e,this),this.finished=!0;let{s0:r,s1:n,s2:o,s3:s}=this,f=ft(e);f[0]=r,f[1]=n,f[2]=o,f[3]=s,Ht||Pt(f.subarray(0,At/4))}digest(){let e=new Uint8Array(At);return this.digestInto(e),this.destroy(),e}};var Ve=We(16,(t,e)=>new Ye(t,e),t=>[t.length]);var Xe=16,Gr=4,ye=new Uint8Array(Xe);var Xr=283;function Qr(t){if(![16,24,32].includes(t.length))throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length='+t.length)}function Qe(t){return t<<1^Xr&-(t>>7)}function Gn(t,e){let r=0;for(;e>0;e>>=1)r^=t&-(e&1),t=Qe(t);return r}var Jr=(()=>{let t=new Uint8Array(256);for(let r=0,n=1;r<256;r++,n^=Qe(n))t[r]=n;let e=new Uint8Array(256);e[0]=99;for(let r=0;r<255;r++){let n=t[255-r];n|=n<<8,e[t[r]]=(n^n>>4^n>>5^n>>6^n>>7^99)&255}return rt(t),e})();var to=t=>t<<24|t>>>8,Ge=t=>t<<8|t>>>24;function eo(t,e){if(t.length!==256)throw new Error("wrong sbox length");let r=new Uint32Array(256).map((a,u)=>e(t[u])),n=r.map(Ge),o=n.map(Ge),s=o.map(Ge),f=new Uint32Array(256*256),c=new Uint32Array(256*256),i=new Uint16Array(256*256);for(let a=0;a<256;a++)for(let u=0;u<256;u++){let l=a*256+u;f[l]=r[a]^n[u],c[l]=o[a]^s[u],i[l]=t[a]<<8|t[u]}return{sbox:t,sbox2:i,T0:r,T1:n,T2:o,T3:s,T01:f,T23:c}}var Qn=eo(Jr,t=>Gn(t,3)<<24|t<<16|t<<8|Gn(t,2));var no=(()=>{let t=new Uint8Array(16);for(let e=0,r=1;e<16;e++,r=Qe(r))t[e]=r;return t})();function ro(t){M(t);let e=t.length;Qr(t);let{sbox2:r}=Qn,n=[];(!Ht||!Ct(t))&&n.push(t=Bt(t));let o=Pt(ft(t)),s=o.length,f=i=>Zt(r,i,i,i,i),c=new Uint32Array(e+28);c.set(o);for(let i=s;i<c.length;i++){let a=c[i-1];i%s===0?a=f(to(a))^no[i/s-1]:s>6&&i%s===4&&(a=f(a)),c[i]=c[i-s]^a}return rt(...n),c}function xe(t,e,r,n,o,s){return t[r<<8&65280|n>>>8&255]^e[o>>>8&65280|s>>>24&255]}function Zt(t,e,r,n,o){return t[e&255|r&65280]|t[n>>>16&255|o>>>16&65280]<<16}function Xn(t,e,r,n,o){let{sbox2:s,T01:f,T23:c}=Qn,i=0;e^=t[i++],r^=t[i++],n^=t[i++],o^=t[i++];let a=t.length/4-2;for(let y=0;y<a;y++){let S=t[i++]^xe(f,c,e,r,n,o),A=t[i++]^xe(f,c,r,n,o,e),L=t[i++]^xe(f,c,n,o,e,r),R=t[i++]^xe(f,c,o,e,r,n);e=S,r=A,n=L,o=R}let u=t[i++]^Zt(s,e,r,n,o),l=t[i++]^Zt(s,r,n,o,e),p=t[i++]^Zt(s,n,o,e,r),g=t[i++]^Zt(s,o,e,r,n);return{s0:u,s1:l,s2:p,s3:g}}function me(t,e,r,n,o){M(r,Xe,"nonce"),M(n),o=Wn(n.length,o);let s=r,f=ft(s),c=It(s),i=ft(n),a=ft(o),u=e?0:12,l=n.length,p=c.getUint32(u,e);for(let y=0;y+4<=i.length;y+=4){let{s0:S,s1:A,s2:L,s3:R}=Xn(t,F(f[0]),F(f[1]),F(f[2]),F(f[3]));a[y+0]=i[y+0]^F(S),a[y+1]=i[y+1]^F(A),a[y+2]=i[y+2]^F(L),a[y+3]=i[y+3]^F(R),p=p+1>>>0,c.setUint32(u,p,e)}let g=Xe*Math.floor(i.length/Gr);if(g<l){let{s0:y,s1:S,s2:A,s3:L}=Xn(t,F(f[0]),F(f[1]),F(f[2]),F(f[3])),R=new Uint32Array([y,S,A,L]);Pt(R);let z=Zn(R);for(let k=g,Q=0;k<l;k++,Q++)o[k]=n[k]^z[Q];rt(R)}return o}function oo(t,e,r,n,o){let s=o?o.length:0,f=t.create(r,n.length+s);o&&f.update(o);let c=Yn(8*n.length,8*s,e);f.update(n),f.update(c);let i=f.digest();return rt(c),i}var Jn=$n({blockSize:16,nonceLength:12,tagLength:16,withAAD:!0,varSizeNonce:!0},function(e,r,n){if(r.length<8)throw new Error("aes/gcm: invalid nonce length");let o=16;function s(c,i,a){let u=oo(Ve,!1,c,a,n);for(let l=0;l<i.length;l++)u[l]^=i[l];return u}function f(){let c=ro(e),i=ye.slice(),a=ye.slice();if(me(c,!1,a,a,i),r.length===12)a.set(r);else{let l=ye.slice();It(l).setBigUint64(8,BigInt(r.length*8),!1);let g=Ve.create(i).update(r).update(l);g.digestInto(a),g.destroy()}let u=me(c,!1,a,ye);return{xk:c,authKey:i,counter:a,tagMask:u}}return{encrypt(c){let{xk:i,authKey:a,counter:u,tagMask:l}=f(),p=new Uint8Array(c.length+o),g=[i,a,u,l];Ct(c)||g.push(c=Bt(c)),me(i,!1,u,c,p.subarray(0,c.length));let y=s(a,l,p.subarray(0,p.length-o));return g.push(y),p.set(y,c.length),rt(...g),p},decrypt(c){let{xk:i,authKey:a,counter:u,tagMask:l}=f(),p=[i,a,l,u];Ct(c)||p.push(c=Bt(c));let g=c.subarray(0,-o),y=c.subarray(-o),S=s(a,l,g);if(p.push(S),!Kn(S,y))throw rt(...p),new Error("aes-gcm: invalid tag");let A=me(i,!1,u,g);return rt(...p),A}}});function so(t){return Array.from(_t.getPublicKey(Uint8Array.from(t),!1))}function io(t,e){return Array.from(_t.sign(Uint8Array.from(t),Uint8Array.from(e),{prehash:!0,format:"compact",lowS:!0,extraEntropy:!1}))}function fo(t){try{return _t.Point.fromBytes(Uint8Array.from(t)).assertValidity(),!0}catch{return!1}}var Je=t=>Uint8Array.from([...t].map(e=>e.charCodeAt(0))),tn=(...t)=>Uint8Array.from(t.flatMap(e=>Array.from(e)));function co(t,e,r,n,o){let s=Uint8Array.from(n),f=Uint8Array.from(e),c=Uint8Array.from(o);if(c.length!==16||r.length!==16||f.length!==65||t.length>3500)throw new Error("Invalid push parameters");let i=_t.getPublicKey(s,!1),a=_t.getSharedSecret(s,f,!1).slice(1,33),u=he(Tt,a,Uint8Array.from(r),tn(Je("WebPush: info\0"),f,i),32),l=he(Tt,u,c,Je("Content-Encoding: aes128gcm\0"),16),p=he(Tt,u,c,Je("Content-Encoding: nonce\0"),12),g=Jn(l,p).encrypt(tn(t,[2]));return Array.from(tn(c,[0,0,16,0,65],i,g))}return ar(ao);})();

// END GENERATED PUSH CRYPTO
