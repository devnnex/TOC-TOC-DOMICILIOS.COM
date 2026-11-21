// Aislado de producción. Solo se importa con ?demo=1 y nunca llama a Apps Script.
import { storageGet, storageSet, token, config } from "./core.js?v=1.3.3";
const KEY = "toc-demo-db-v1";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function initial() {
  const now = Date.now();
  const examples = [
    [
      "Valentina · Ejemplo",
      "Calle 49 # 8-25, barrio Colombia",
      "envio",
      "pending",
      0,
      7.0637,
      -73.8581,
    ],
    [
      "Mateo · Ejemplo",
      "Carrera 24 # 52-18, barrio Torcoroma",
      "compra",
      "pending",
      4,
      7.0657,
      -73.8413,
    ],
    [
      "Sofía · Ejemplo",
      "Calle 60 # 17-30, barrio Galán",
      "diligencia",
      "accepted",
      15,
      7.0716,
      -73.8506,
    ],
    [
      "Daniel · Ejemplo",
      "Carrera 15 # 48-16, sector Centro",
      "envio",
      "completed",
      65,
      7.061,
      -73.852,
    ],
  ].map(([name, address, service, status, min, lat, lng]) => ({
    id: crypto.randomUUID(),
    trackingToken: token(),
    createdAt: new Date(now - min * 60000).toISOString(),
    updatedAt: new Date().toISOString(),
    status,
    cityId: config.city.id,
    name,
    phone: "3000000000",
    address,
    reference: "Dirección ficticia para demostración",
    notes: "Datos de ejemplo. No atender como un servicio real.",
    service,
    lat,
    lng,
    accuracy: 18,
    locationAt: new Date().toISOString(),
    locationMode: "gps",
    courier: status === "pending" ? "" : "Nicolás · Ejemplo",
    courierPhone: status === "pending" ? "" : "3000000000",
    fee: status === "pending" ? "" : 6000,
    acceptedAt:
      status === "pending"
        ? ""
        : new Date(now - (min - 2) * 60000).toISOString(),
    completedAt:
      status === "completed" ? new Date(now - 20 * 60000).toISOString() : "",
    revision: 1,
  }));
  return {
    revision: token(),
    orders: examples,
    users: [
      {
        id: "demo-owner",
        email: "jefe@demo.local",
        name: "Alex · Demo",
        role: "owner",
        cityId: config.city.id,
        active: true,
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
function db() {
  let d = storageGet(KEY);
  if (!d) {
    d = initial();
    storageSet(KEY, d);
  }
  return d;
}
function save(d) {
  d.revision = token();
  storageSet(KEY, d);
}
const fail = (message) => {
  throw new Error(message);
};
const safe = (o) => {
  const c = { ...o };
  delete c.trackingToken;
  return c;
};
export async function request(action, data, session) {
  await new Promise((resolve) => setTimeout(resolve, 110));
  const d = db(),
    user = d.users.find((u) => u.id === session) || d.users[0];
  const auth = () => {
    if (!session || !user.active) fail("Inicia la sesión de demostración.");
  };
  const order = () =>
    d.orders.find((o) => o.id === data.id) ||
    fail("No se encontró el servicio.");
  const tracking = () => {
    const o = order();
    if (o.trackingToken !== data.trackingToken)
      fail("No tienes acceso a este seguimiento.");
    return o;
  };
  if (action === "challenge")
    return { salt: "toc-demo-" + data.email.toLowerCase(), iterations: 310000 };
  if (action === "resolveLocation")
    return {
      address: "Calle 49 # 8-25 · Dirección de ejemplo",
      lat: data.lat,
      lng: data.lng,
      provider: "Demostración local",
      approximate: true,
    };
  if (action === "searchAddress")
    return {
      results: [
        {
          address: `${data.address}, ${config.city.name} · Ejemplo`,
          lat: config.city.lat,
          lng: config.city.lng,
        },
      ],
      provider: "Demostración local",
    };
  if (action === "login" || action === "bootstrap" || action === "demoLogin")
    return {
      token: d.users[0].id,
      expiresAt: new Date(Date.now() + 8 * 3600000).toISOString(),
      user: d.users[0],
      city: config.city,
    };
  if (action === "createRequest") {
    const prev = d.orders.find((o) => o.id === data.id);
    if (prev) return safe(prev);
    const o = {
      ...data,
      phone: data.phone.replace(/\s/g, ""),
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locationMode: data.locationMode || "manual",
      lat: data.lat ?? "",
      lng: data.lng ?? "",
      courier: "",
      courierPhone: "",
      fee: "",
      revision: 1,
    };
    d.orders.unshift(o);
    save(d);
    return safe(o);
  }
  if (action === "trackRequest") return safe(tracking());
  if (action === "updateLocation") {
    const o = tracking();
    if (!["pending", "accepted"].includes(o.status)) return { updated: false };
    Object.assign(o, {
      lat: data.lat,
      lng: data.lng,
      locationAt: data.locationAt,
      accuracy: data.accuracy,
      address: data.address || o.address,
    });
    save(d);
    return { updated: true };
  }
  if (action === "cancelRequest") {
    const o = tracking();
    if (o.status !== "pending")
      fail("El servicio ya fue aceptado. Contacta al equipo.");
    o.status = "cancelled";
    o.cancelReason = "Cancelado por el cliente.";
    o.revision++;
    save(d);
    return safe(o);
  }
  auth();
  if (action === "me") return { user, city: config.city };
  if (action === "logout") return { loggedOut: true };
  if (action === "dashboard")
    return data.revision === d.revision && data.day === today()
      ? { unchanged: true, revision: d.revision, day: today() }
      : {
          orders: d.orders.map(safe),
          revision: d.revision,
          day: today(),
          today: statistics(d, 1).totals,
          city: config.city,
        };
  if (action === "transition") {
    const o = order();
    if (o.revision !== data.revision)
      throw Object.assign(
        new Error("El servicio cambió. Actualiza el panel."),
        { code: "CONFLICT" },
      );
    if (
      !{
        pending: ["accepted", "cancelled"],
        accepted: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      }[o.status].includes(data.status)
    )
      fail("Cambio de estado no disponible.");
    o.status = data.status;
    o.revision++;
    o.updatedAt = new Date().toISOString();
    if (o.status === "accepted") {
      Object.assign(o, {
        courier: data.courier,
        courierPhone: data.courierPhone,
        fee: Number(data.fee),
      });
      o.acceptedAt = new Date().toISOString();
    }
    if (o.status === "completed") o.completedAt = new Date().toISOString();
    if (o.status === "cancelled") o.cancelReason = data.cancelReason;
    save(d);
    return safe(o);
  }
  if (action === "stats") return statistics(d, data.days);
  if (action === "history") {
    const all = d.orders
      .filter(
        (o) =>
          o.createdAt.slice(0, 10) >= data.from &&
          o.createdAt.slice(0, 10) <= data.to &&
          (!data.status || o.status === data.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = data.offset || 0;
    return {
      orders: all.slice(offset, offset + 50).map(safe),
      nextOffset: offset + 50 < all.length ? offset + 50 : null,
      total: all.length,
    };
  }
  if (action === "listUsers") return d.users;
  if (action === "createUser") {
    if (d.users.some((u) => u.email === data.email))
      fail("El correo ya existe.");
    const u = {
      id: crypto.randomUUID(),
      name: data.name,
      email: data.email,
      role: "admin",
      cityId: config.city.id,
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    d.users.push(u);
    save(d);
    return u;
  }
  if (action === "setUserActive") {
    const u = d.users.find((u) => u.id === data.id);
    if (!u || u.role === "owner") fail("Acción no permitida.");
    u.active = data.active;
    save(d);
    return u;
  }
  if (action === "resetPassword") return { reset: true };
  if (action === "changePassword") {
    user.mustChangePassword = false;
    save(d);
    return { user };
  }
  if (action === "seedDemo") {
    const o = {
      ...initial().orders[0],
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name: "Nueva solicitud · Ejemplo",
    };
    d.orders.unshift(o);
    save(d);
    return safe(o);
  }
  fail("Acción no disponible en demostración.");
}
function statistics(d, days = 30) {
  const list = [];
  const base = new Date(today() + "T12:00:00-05:00");
  for (let i = Number(days) - 1; i >= 0; i--) {
    const at = new Date(base - i * 86400000),
      day = at.toISOString().slice(0, 10);
    const o = d.orders.filter(
      (o) =>
        new Date(o.createdAt).toLocaleDateString("en-CA", {
          timeZone: "America/Bogota",
        }) === day,
    );
    list.push({
      day,
      requested: o.length,
      accepted: o.filter((o) => o.acceptedAt).length,
      completed: o.filter((o) => o.status === "completed").length,
      cancelled: o.filter((o) => o.status === "cancelled").length,
      revenue: o
        .filter((o) => o.status === "completed")
        .reduce((s, o) => s + Number(o.fee || 0), 0),
      acceptSeconds: o
        .filter((o) => o.acceptedAt)
        .reduce(
          (s, o) =>
            s +
            Math.round((new Date(o.acceptedAt) - new Date(o.createdAt)) / 1000),
          0,
        ),
      envio: o.filter((o) => o.service === "envio").length,
      compra: o.filter((o) => o.service === "compra").length,
      diligencia: o.filter((o) => o.service === "diligencia").length,
    });
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
  list.forEach((s) => Object.keys(totals).forEach((k) => (totals[k] += s[k])));
  totals.acceptanceRate = totals.requested
    ? Math.round((totals.accepted / totals.requested) * 100)
    : 0;
  totals.avgAcceptSeconds = totals.accepted
    ? Math.round(totals.acceptSeconds / totals.accepted)
    : 0;
  return { days: list, totals };
}
