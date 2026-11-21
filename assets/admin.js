import {
  $,
  $$,
  config,
  demo,
  api,
  banner,
  wireDialogs,
  busy,
  notify,
  el,
  icon,
  storageGet,
  storageSet,
  passwordKey,
  statusLabels,
  serviceLabels,
  money,
  date,
  time,
  sound,
  poll,
  inCity,
} from "./core.js?v=1.3.4";
import { mapPreview, autocomplete } from "./maps.js?v=1.3.4";
import { normalizeOrder } from "./orders.js?v=1.3.4";
import { initPwa, enablePush, syncPush, forgetPush } from "./pwa.js?v=1.3.4";
banner();
wireDialogs();
const sessionKey = demo ? "toc-demo-session" : "toc-session";
let session = storageGet(sessionKey, null, sessionStorage),
  city = config.city,
  orders = [],
  revision = "",
  serverDay = "",
  todayStats = {},
  watcher,
  currentView = "",
  filter = "pending",
  search = "",
  selected = null,
  firstLoad = true,
  historyOffset = 0,
  setupMode = false,
  accessReady = false,
  accessCheck = 0;
let resetUser = null;
initPwa({
  role: "admin",
  target: () =>
    session?.user
      ? {
          id: session.user.id,
          userId: session.user.id,
          role: session.user.role,
          mustChangePassword: session.user.mustChangePassword,
        }
      : null,
  session: () => session?.token || "",
});
window.addEventListener("toc:push-state", (event) => {
  if (event.detail.role === "admin" && event.detail.enabled) {
    $("#sound-button span").textContent = "Avisos activados";
    $("#sound-button").classList.add("enabled");
  }
});
window.addEventListener("toc:audio-state", () => {
  if (!sound.enabled) {
    $("#sound-button span").textContent = sound.pending
      ? "Toca para oír avisos pendientes"
      : "Activar sonido";
    $("#sound-button").classList.remove("enabled");
  }
});
const statsNode = (label, value, detail, name, cls = "") => {
  const n = el("article", `kpi-card ${cls}`),
    head = el("div", "kpi-head");
  head.append(el("span", "", label), icon(name));
  n.append(
    head,
    el("strong", "kpi-value", value),
    el("span", "kpi-detail", detail),
  );
  return n;
};
$("#today-label").textContent = date(Date.now(), {
  weekday: "long",
  year: "numeric",
});
if (demo) {
  $("#back-home").href = "index.html?demo=1";
  $("#sidebar-brand").href = "index.html?demo=1";
  $("#client-link").href = "index.html?demo=1";
  $("#seed-demo").hidden = false;
}
function renderAccessState(state) {
  setupMode = state.state === "needs_owner";
  accessReady =
    state.state === "ready" || (setupMode && state.bootstrapAvailable === true);
  $("#login-form").hidden = !accessReady;
  $("#access-status").hidden = accessReady;
  $("#login-submit").disabled = !accessReady;
  $("#setup-fields").hidden = !setupMode;
  $('#setup-fields input[name="name"]').required = setupMode;
  $('#setup-fields input[name="passwordConfirmation"]').required = setupMode;
  $('#setup-fields input[name="bootstrapToken"]').required = setupMode;
  $('#login-form input[name="password"]').autocomplete = setupMode
    ? "new-password"
    : "current-password";
  $("#access-pill").textContent = setupMode
    ? "CONFIGURACIÓN INICIAL OBLIGATORIA"
    : "ESPACIO DEL EQUIPO";
  $("#access-title").textContent = setupMode
    ? "Primero, crea tu cuenta de jefe."
    : "Vamos a mover la ciudad.";
  $("#login-submit").textContent = setupMode
    ? "Crear mi cuenta y entrar"
    : "Entrar al panel";
  $("#login-description").textContent = setupMode
    ? "Todavía no hay usuarios. Define tu correo de acceso y contraseña para comenzar. Después podrás crear administradores desde Mi equipo."
    : "Ingresa con la cuenta que te asignó tu jefe.";
}
function accessGuide(title, description) {
  $("#access-guide").hidden = false;
  $("#access-guide").replaceChildren(
    el("strong", "", title),
    el("p", "", description),
  );
}
async function checkInstallation() {
  if (demo) return renderAccessState({ state: "ready" });
  const check = ++accessCheck;
  accessReady = false;
  $("#login-submit").disabled = true;
  $("#login-form").hidden = true;
  $("#access-guide").hidden = true;
  $("#access-retry").hidden = true;
  $("#access-status").hidden = false;
  $("#access-status").textContent = "Comprobando la instalación…";
  $("#access-title").textContent = "Preparando tu acceso.";
  try {
    const state = await api("installationStatus");
    if (check !== accessCheck) return;
    if (
      !state ||
      !["needs_setup", "needs_owner", "ready"].includes(state.state)
    )
      throw new Error(
        "El despliegue no devolvió un estado de instalación válido.",
      );
    renderAccessState(state);
    $("#access-status").hidden = accessReady;
    if (
      state.state === "needs_setup" ||
      (setupMode && !state.bootstrapAvailable)
    ) {
      $("#access-title").textContent = "Falta preparar tu sistema.";
      $("#login-description").textContent =
        "El primer acceso se habilitará cuando esté lista la instalación.";
      $("#access-status").textContent = "Instalación pendiente";
      accessGuide(
        "Prepara el sistema desde tu cuenta de Google",
        "Ejecuta setup() en el proyecto de Apps Script conectado a esta web. Conserva el código privado del registro y vuelve a comprobar. No borres las hojas existentes.",
      );
      $("#access-retry").hidden = false;
    }
  } catch (e) {
    if (check !== accessCheck) return;
    const previousBackend = ["UNAUTHORIZED", "UNKNOWN_ACTION"].includes(e.code);
    $("#access-title").textContent = previousBackend
      ? "Actualiza la conexión del panel."
      : "Revisemos tu conexión.";
    $("#login-description").textContent =
      "Necesitamos comprobar la instalación antes de habilitar el acceso.";
    $("#access-status").textContent = previousBackend
      ? "El despliegue todavía usa una versión anterior."
      : e.message;
    accessGuide(
      previousBackend
        ? "Actualiza Apps Script una sola vez"
        : "Vuelve a intentarlo",
      previousBackend
        ? "Reemplaza Code.gs por la versión actual, guarda y actualiza la implementación web a una nueva versión conservando la misma URL /exec. Al volver, este panel te pedirá crear el jefe si la hoja Users está vacía."
        : "Comprueba tu conexión y que la URL /exec corresponda al despliegue público del proyecto. Después vuelve a comprobar.",
    );
    $("#access-retry").hidden = false;
  }
}
$("#access-retry").addEventListener("click", checkInstallation);
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!accessReady) return;
  const d = Object.fromEntries(new FormData(event.currentTarget));
  if (setupMode && d.password !== d.passwordConfirmation) {
    $("#login-error").textContent =
      "Las contraseñas no coinciden. Escríbelas de nuevo.";
    $("#login-error").hidden = false;
    return;
  }
  enableAlerts(false);
  const button = $("#login-submit");
  busy(button, true, "Verificando tu acceso…");
  $("#login-error").hidden = true;
  try {
    const email = d.email.toLowerCase().trim(),
      c = await api("challenge", { email }),
      key = await passwordKey(d.password, c.salt);
    const r = await api(setupMode ? "bootstrap" : "login", {
      email,
      passwordKey: key,
      name: d.name,
      bootstrapToken: d.bootstrapToken,
    });
    session = r;
    storageSet(sessionKey, r, sessionStorage);
    $("#login-form").reset();
    renderAccessState({ state: "ready" });
    await enter();
  } catch (e) {
    if (["OWNER_REQUIRED", "OWNER_ALREADY_EXISTS"].includes(e.code))
      await checkInstallation();
    $("#login-error").textContent = e.message;
    $("#login-error").hidden = false;
  } finally {
    busy(button, false);
    button.disabled = !accessReady;
    button.textContent = setupMode
      ? "Crear mi cuenta y entrar"
      : "Entrar al panel";
  }
});
async function enter() {
  const r = await api("me", {}, session.token);
  session.user = r.user;
  city = r.city;
  storageSet(sessionKey, session, sessionStorage);
  $("#login-screen").hidden = true;
  $("#admin-app").hidden = false;
  $("#admin-city").textContent = city.name;
  $("#operator-name").textContent = session.user.name;
  $("#operator-role").textContent =
    session.user.role === "owner" ? "Jefe · Acceso completo" : "Administrador";
  $("#operator-avatar").textContent = $("#header-avatar").textContent =
    session.user.name.charAt(0).toUpperCase();
  $("#team-nav").hidden = session.user.role !== "owner";
  $("#team-city-caption").textContent =
    `Acceso de administrador para ${city.name}. La ciudad se asigna desde el servidor.`;
  $("#system-status").replaceChildren(
    ...[
      ["Tu usuario de acceso", session.user.email],
      ["Ciudad operativa", city.name],
      ["Estado", demo ? "Demostración" : "Conectado"],
      ["Servicios", "Se actualizan automáticamente"],
      ["Sesión válida hasta", time(session.expiresAt)],
      ["Ubicación", "Disponible en cada servicio"],
    ].map(([k, v]) => {
      const n = el("div", "detail-row");
      n.append(el("span", "", k), el("strong", "", v));
      return n;
    }),
  );
  if (session.user.mustChangePassword) {
    location.hash = "settings";
    $("#password-notice").textContent =
      "Antes de operar, cambia tu contraseña inicial. El resto del panel se habilitará después.";
  }
  watcher?.stop();
  if (!session.user.mustChangePassword)
    watcher = poll(sync, config.adminPollMs);
  route();
  syncPush();
}
function showLogin(message = "") {
  watcher?.stop();
  session = null;
  storageSet(sessionKey, null, sessionStorage);
  $("#admin-app").hidden = true;
  $("#login-screen").hidden = false;
  orders = [];
  revision = "";
  serverDay = "";
  firstLoad = true;
  checkInstallation();
  if (message) {
    $("#login-error").textContent = message;
    $("#login-error").hidden = false;
  }
}
$("#logout-button").addEventListener("click", async () => {
  const button = $("#logout-button");
  busy(button, true, "Cerrando sesión…");
  try {
    await forgetPush();
    await api("logout", {}, session.token);
    showLogin();
  } catch (e) {
    notify(
      "Se cerró la sesión en este navegador. La sesión remota vencerá automáticamente.",
    );
    showLogin();
  } finally {
    busy(button, false);
  }
});
async function sync() {
  if (!session) return;
  try {
    const result = await api(
      "dashboard",
      { revision, day: serverDay },
      session.token,
    );
    $("#connection-state").textContent = "Panel conectado";
    $("#connection-state").classList.add("connected");
    $("#last-sync").textContent = `Actualizado ${time(Date.now())}`;
    if (result.unchanged) {
      if (orders.length && !$("#requests-list").children.length) renderInbox();
      $("#admin-error").hidden = true;
      return;
    }
    const incoming = result.orders
      .map(normalizeOrder)
      .map((order, index) => ({ ...order, _arrival: index }))
      .sort((a, b) => {
        const priority = {
          pending: 0,
          accepted: 1,
          completed: 2,
          cancelled: 3,
        };
        return (
          priority[a.status] - priority[b.status] ||
          String(a.createdAt).localeCompare(String(b.createdAt)) ||
          a._arrival - b._arrival
        );
      });
    const ids = new Set(orders.map((o) => o.id));
    const newOnes = incoming.filter(
      (o) => o.status === "pending" && !ids.has(o.id),
    );
    for (const order of newOnes)
      sound.alert(
        "admin:" + order.id + ":new",
        "TocToc. Nueva solicitud de domicilio. Revisa el centro de servicios.",
      );
    if (!firstLoad && newOnes.length) {
      notify(
        `${newOnes.length} nueva${newOnes.length === 1 ? " solicitud" : "s solicitudes"} por aceptar.`,
      );
    }
    orders = incoming;
    todayStats = result.today;
    renderInbox();
    // No confirmamos esta revisión hasta que sus solicitudes estén visibles.
    revision = result.revision;
    serverDay = result.day;
    firstLoad = false;
    $("#admin-error").hidden = true;
  } catch (e) {
    $("#connection-state").textContent = "Reconectando";
    $("#connection-state").classList.remove("connected");
    handleError(e);
    throw e;
  }
}
function handleError(e) {
  if (e.code === "UNAUTHORIZED") return showLogin(e.message);
  if (e.code === "PASSWORD_CHANGE_REQUIRED") {
    session.user.mustChangePassword = true;
    location.hash = "settings";
    route();
    return;
  }
  $("#admin-error").textContent = e.message;
  $("#admin-error").hidden = false;
}
window.addEventListener("hashchange", route);
window.addEventListener("toc:service-update", () => watcher?.refresh());
function route() {
  if (!session) return;
  let view = location.hash.slice(1) || "inbox";
  if (!["inbox", "analytics", "history", "team", "settings"].includes(view))
    view = "inbox";
  if (view === "team" && session.user.role !== "owner") view = "inbox";
  if (session.user.mustChangePassword) view = "settings";
  currentView = view;
  $$(".admin-view").forEach((n) => (n.hidden = n.id !== `view-${view}`));
  $$("[data-view]").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === view);
    if (n.dataset.view === view) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  if (view === "analytics") loadStats();
  if (view === "team") loadTeam();
  if (view === "history") loadHistory(true);
}
$$("[data-filter]").forEach((b) =>
  b.addEventListener("click", () => {
    filter = b.dataset.filter;
    $$("[data-filter]").forEach((x) => x.classList.toggle("active", x === b));
    renderRequests();
  }),
);
$("#search-requests").addEventListener("input", (e) => {
  search = e.target.value.toLocaleLowerCase().trim();
  renderRequests();
});
$("#refresh-button").addEventListener("click", () => {
  revision = "";
  watcher?.refresh();
});
$("#seed-demo").addEventListener("click", async () => {
  await api("seedDemo", {}, session.token);
  watcher?.refresh();
});
function renderInbox() {
  const pending = orders.filter((o) => o.status === "pending").length,
    accepted = orders.filter((o) => o.status === "accepted").length;
  $("#pending-count").textContent = $("#tab-pending").textContent = pending;
  $("#tab-accepted").textContent = accepted;
  document.title = `${pending ? `(${pending}) ` : ""}Equipo · TocToc`;
  $("#inbox-kpis").replaceChildren(
    statsNode(
      "Por aceptar",
      pending,
      "Esperando tu próximo toque",
      "clock",
      "kpi-highlight",
    ),
    statsNode("En camino", accepted, "Servicios en movimiento", "bike"),
    statsNode(
      "Completados hoy",
      todayStats.completed || 0,
      "Solicitados durante el día",
      "check",
    ),
    statsNode(
      "Tarifas de hoy",
      money(todayStats.revenue),
      "De servicios completados",
      "chart",
    ),
  );
  renderRequests();
}
function renderRequests() {
  const list = $("#requests-list");
  const opened = new Set($$("details[open]", list).map((x) => x.dataset.id));
  const showing = orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      (!search ||
        `${o.name} ${o.address} ${o.id}`.toLocaleLowerCase().includes(search)),
  );
  $("#list-caption").textContent =
    `${filter === "pending" ? "SOLICITUDES ENTRANTES" : filter === "accepted" ? "SERVICIOS EN CAMINO" : "TODOS LOS SERVICIOS"} · ${showing.length}`;
  if (!showing.length) {
    const n = el("div", "empty-state");
    n.append(
      icon(filter === "pending" ? "bolt" : "box"),
      el(
        "h2",
        "",
        search
          ? "No encontramos coincidencias."
          : filter === "pending"
            ? "Todo al día. El próximo toque viene en camino."
            : "Aquí aparecerán tus servicios.",
      ),
      el(
        "p",
        "muted",
        search
          ? "Prueba con otro nombre o dirección."
          : "Mantén este panel abierto. Las nuevas solicitudes aparecen automáticamente.",
      ),
    );
    list.replaceChildren(n);
    return;
  }
  const fragment = document.createDocumentFragment();
  showing.forEach((o, i) => {
    try {
      fragment.append(
        requestCard(o, opened.has(o.id) || (i === 0 && o.status === "pending")),
      );
    } catch {
      // Una tarjeta incompleta conserva los datos y las acciones principales.
      const fallback = el("article", "request-item request-fallback");
      fallback.append(
        el("h3", "", o.name),
        el("p", "", o.address),
        el(
          "p",
          "field-help",
          `Solicitud #${o.id} · ${statusLabels[o.status] || "Revisar estado"}`,
        ),
      );
      if (o.status === "pending") {
        const accept = el(
          "button",
          "button button-primary",
          "Aceptar y enviar domiciliario",
        );
        accept.addEventListener("click", () => openAction(o, "accepted"));
        fallback.append(accept);
      }
      fallback.append(
        el(
          "p",
          "field-help",
          "Vista resumida disponible. Puedes actualizar para volver a cargar el detalle.",
        ),
      );
      fragment.append(fallback);
    }
  });
  list.replaceChildren(fragment);
}
function requestCard(o, open) {
  const card = el("article", `request-item status-${o.status}`);
  const details = el("details");
  details.dataset.id = o.id;
  const summary = el("summary", "request-summary");
  const av = el("span", "request-avatar", o.name.charAt(0).toUpperCase());
  const identity = el("div", "request-identity");
  identity.append(el("strong", "", o.name), el("span", "", o.address));
  const meta = el("div", "request-meta");
  meta.append(
    el("span", `status-badge badge-${o.status}`, statusLabels[o.status]),
    el("span", "micro", `${serviceLabels[o.service]} · ${time(o.createdAt)}`),
  );
  summary.append(av, identity, meta, icon("chevron"));
  details.append(summary);
  const body = el("div", "request-body");
  const info = el("div", "request-info");
  const ref = el("div", "request-reference");
  ref.append(
    el("span", "eyebrow", `SOLICITUD #${o.id.slice(0, 8).toUpperCase()}`),
    el("h3", "", o.address),
  );
  info.append(ref);
  const data = [
    ["Referencia", o.reference],
    ["Instrucciones", o.notes],
    [
      "Tipo de ubicación",
      o.locationMode === "gps"
        ? `GPS · precisión ${o.accuracy || "no disponible"} m · ${o.locationAt ? time(o.locationAt) : ""}`
        : o.locationMode === "manual_place"
          ? "Dirección elegida en Google Maps"
          : "Dirección escrita por el cliente",
    ],
    ["Domiciliario", o.courier],
    ["Celular del domiciliario", o.courierPhone],
    ["Tarifa", o.fee !== "" && o.fee != null ? money(o.fee) : "Por confirmar"],
    ["Motivo", o.cancelReason],
  ];
  data.forEach(([k, v]) => {
    if (!v) return;
    const r = el("div", "order-info-row");
    r.append(el("span", "", k), el("p", "", v));
    info.append(r);
  });
  const call = el("a", "call-link", o.phone);
  call.prepend(icon("phone"));
  call.href = `tel:${o.phone.replace(/[^+\d]/g, "")}`;
  info.append(call);
  const mapDetails = el("details", "map-disclosure");
  const mapSummary = el("summary");
  mapSummary.append(
    icon("pin"),
    document.createTextNode(" Ubicación y búsqueda de dirección"),
    icon("chevron"),
  );
  mapDetails.append(mapSummary);
  const mapHost = el("div", "map-host");
  mapDetails.append(mapHost);
  let mounted = false;
  mapDetails.addEventListener("toggle", () => {
    if (!mapDetails.open || mounted) return;
    mounted = true;
    mapHost.append(mapPreview(o, city));
    const searchHost = el("div", "places-host");
    mapHost.append(searchHost);
    autocomplete(
      searchHost,
      city,
      (p) => {
        if (!inCity(p, city))
          return notify("La dirección está fuera de la zona de operación.");
        mapHost
          .querySelector(".map-preview")
          ?.replaceWith(mapPreview({ ...o, ...p }, city));
        notify(
          "Vista de consulta actualizada. La dirección solicitada por el cliente se conserva.",
        );
      },
      o.address,
    );
  });
  if (open) mapDetails.open = true;
  body.append(info, mapDetails);
  const actions = el("div", "request-actions");
  actions.append(
    el("span", "micro", `Recibido ${date(o.createdAt)} · ${time(o.createdAt)}`),
  );
  if (o.status === "pending") {
    const cancel = el("button", "text-button danger-text", "Rechazar"),
      accept = el(
        "button",
        "button button-primary",
        "Aceptar y enviar domiciliario",
      );
    cancel.addEventListener("click", () => openAction(o, "cancelled"));
    accept.addEventListener("click", () => openAction(o, "accepted"));
    actions.append(cancel, accept);
  }
  if (o.status === "accepted") {
    const cancel = el("button", "text-button danger-text", "Cancelar servicio"),
      complete = el("button", "button button-dark", "Marcar completado");
    cancel.addEventListener("click", () => openAction(o, "cancelled"));
    complete.addEventListener("click", () => openAction(o, "completed"));
    actions.append(cancel, complete);
  }
  body.append(actions);
  details.append(body);
  card.append(details);
  details.open = open;
  return card;
}
function openAction(o, status) {
  selected = { ...o, targetStatus: status };
  $("#action-form").reset();
  $("#action-error").hidden = true;
  $("#accept-fields").hidden = status !== "accepted";
  $$("#accept-fields input").forEach(
    (x) => (x.required = status === "accepted"),
  );
  $("#cancel-fields").hidden = status !== "cancelled";
  $("#cancel-fields textarea").required = status === "cancelled";
  $("#action-title").textContent = {
    accepted: "Ponemos este servicio en marcha.",
    cancelled: "Cancelar este servicio",
    completed: "¿Todo entregado?",
  }[status];
  $("#action-description").textContent =
    status === "accepted"
      ? `Asigna el domiciliario para ${o.name}. El cliente recibirá un aviso con sonido y voz si su navegador lo permite.`
      : status === "completed"
        ? "Confirma que el servicio terminó. La tarifa se incluirá en las estadísticas de servicios completados."
        : "Explica el motivo. El cliente podrá verlo en su seguimiento.";
  $("#action-submit").textContent = {
    accepted: "Aceptar y avisar al cliente",
    cancelled: "Confirmar cancelación",
    completed: "Confirmar servicio completado",
  }[status];
  $("#action-dialog").showModal();
}
$("#action-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const b = $("#action-submit");
  busy(b, true, "Guardando y notificando…");
  try {
    const d = Object.fromEntries(new FormData(event.currentTarget));
    const r = normalizeOrder(
      await api(
        "transition",
        {
          ...d,
          id: selected.id,
          revision: selected.revision,
          status: selected.targetStatus,
        },
        session.token,
      ),
    );
    orders = orders.map((o) => (o.id === r.id ? r : o));
    $("#action-dialog").close();
    revision = "";
    renderInbox();
    watcher?.refresh();
    notify(
      r.status === "accepted"
        ? "Servicio aceptado. El cliente verá la confirmación al actualizar su seguimiento."
        : "Estado del servicio actualizado.",
    );
  } catch (e) {
    $("#action-error").textContent = e.message;
    $("#action-error").hidden = false;
    if (e.code === "CONFLICT") {
      revision = "";
      watcher?.refresh();
    }
  } finally {
    busy(b, false);
  }
});
async function enableAlerts(test = true, outside = true) {
  // Request permission during the click, before audio or network awaits.
  const pushReady = test && outside ? enablePush() : null;
  const on = await sound.enable();
  $("#sound-button span").textContent = on
    ? "Alertas activadas"
    : "Activar avisos";
  $("#sound-button").classList.toggle("enabled", on);
  if (on && test)
    sound.play(
      "TocToc. Sonido y voz activados. Estamos listos para recibir nuevos servicios.",
    );
  if (!on) notify("Revisa los permisos de audio de tu navegador.");
  if (test && outside) {
    const ready = await pushReady;
    $("#sound-button span").textContent = ready
      ? "Avisos activados"
      : on
        ? "Sonido en página"
        : "Activar avisos";
  }
}
$("#sound-button").addEventListener("click", () => enableAlerts());
$("#test-sound").addEventListener("click", () => enableAlerts(true, false));
let statsLoad = 0;
async function loadStats() {
  const load = ++statsLoad;
  try {
    const r = await api(
      "stats",
      { days: Number($("#stats-period").value) },
      session.token,
    );
    if (load !== statsLoad) return;
    const t = r.totals;
    $("#analytics-kpis").replaceChildren(
      statsNode(
        "Servicios solicitados",
        t.requested,
        `${t.completed} completados · ${t.cancelled} cancelados`,
        "box",
      ),
      statsNode(
        "Tasa de aceptación",
        `${t.acceptanceRate}%`,
        `${t.accepted} servicios aceptados`,
        "check",
      ),
      statsNode(
        "Respuesta promedio",
        t.accepted
          ? `${Math.round((t.avgAcceptSeconds / 60) * 10) / 10} min`
          : "—",
        "Desde solicitud hasta aceptación",
        "clock",
      ),
      statsNode(
        "Tarifas registradas",
        money(t.revenue),
        "Servicios completados del período",
        "chart",
      ),
    );
    const chart = $("#activity-chart");
    chart.replaceChildren();
    const max = Math.max(1, ...r.days.map((x) => Number(x.requested)));
    r.days.forEach((d, i) => {
      const group = el("div", "chart-day");
      group.title = `${d.day}: ${d.requested} solicitudes, ${d.completed} completados`;
      const bars = el("div", "chart-bars");
      const a = el("span", "chart-bar requested-bar"),
        b = el("span", "chart-bar completed-bar");
      a.style.height = `${(d.requested / max) * 100}%`;
      b.style.height = `${(d.completed / max) * 100}%`;
      bars.append(a, b);
      group.append(
        bars,
        el(
          "span",
          "micro",
          r.days.length <= 7 || i % Math.ceil(r.days.length / 7) === 0
            ? d.day.slice(8)
            : "",
        ),
      );
      chart.append(group);
    });
    chart.setAttribute(
      "aria-label",
      `${t.requested} solicitudes y ${t.completed} completados en los últimos ${r.days.length} días. El detalle está en la tabla diaria.`,
    );
    $("#chart-summary").textContent =
      `${date(r.days[0].day + "T12:00:00-05:00")} — ${date(r.days.at(-1).day + "T12:00:00-05:00")} · ${t.requested} movimientos solicitados`;
    $("#service-breakdown").replaceChildren(
      ...Object.entries(serviceLabels).map(([k, label]) => {
        const row = el("div", "breakdown-row");
        const head = el("div");
        head.append(el("span", "", label), el("strong", "", t[k] || 0));
        const track = el("div", "progress-track"),
          fill = el("span");
        fill.style.width = `${t.requested ? (t[k] / t.requested) * 100 : 0}%`;
        track.append(fill);
        row.append(head, track);
        return row;
      }),
    );
    $("#business-insight").replaceChildren(
      el(
        "strong",
        "",
        t.requested
          ? "Tu siguiente oportunidad"
          : "Tu primer movimiento empieza aquí",
      ),
      el(
        "p",
        "",
        t.requested
          ? `${t.requested - t.accepted} solicitudes del período todavía no registran aceptación. Revisa cancelaciones y servicios pendientes para entender el resultado.`
          : "Cuando lleguen los primeros servicios, aquí podrás ver tendencias de aceptación, respuesta y tarifas.",
      ),
    );
    $("#daily-stats").replaceChildren(
      ...[...r.days].reverse().map((d) => {
        const row = el("tr");
        [
          date(d.day + "T12:00:00-05:00"),
          d.requested,
          d.accepted,
          d.completed,
          d.cancelled,
          money(d.revenue),
        ].forEach((v) => row.append(el("td", "", v)));
        return row;
      }),
    );
  } catch (e) {
    handleError(e);
  }
}
$("#stats-period").addEventListener("change", loadStats);
const dateKey = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};
$("#history-from").value = dateKey(-29);
$("#history-to").value = dateKey(0);
$("#history-search").addEventListener("click", () => loadHistory(true));
$("#history-more").addEventListener("click", () => loadHistory(false));
async function loadHistory(reset = false) {
  const b = $("#history-search");
  busy(b, true, "Consultando…");
  $("#history-more").disabled = true;
  try {
    const r = await api(
      "history",
      {
        from: $("#history-from").value,
        to: $("#history-to").value,
        status: $("#history-status").value,
        offset: reset ? 0 : historyOffset,
      },
      session.token,
    );
    if (reset) $("#history-table").replaceChildren();
    if (!r.orders.length && reset) {
      const tr = el("tr"),
        td = el("td", "table-empty", "No hay servicios en este período.");
      td.colSpan = 6;
      tr.append(td);
      $("#history-table").append(tr);
    }
    r.orders.forEach((o) => {
      const tr = el("tr");
      [
        `${date(o.createdAt)} · #${o.id.slice(0, 8)}`,
        o.name,
        o.address,
        statusLabels[o.status],
        o.courier || "—",
        o.fee !== "" && o.fee != null ? money(o.fee) : "—",
      ].forEach((v) => tr.append(el("td", "", v)));
      $("#history-table").append(tr);
    });
    historyOffset = r.nextOffset;
    $("#history-more").hidden = r.nextOffset == null;
  } catch (e) {
    handleError(e);
  } finally {
    busy(b, false);
    $("#history-more").disabled = false;
  }
}
async function loadTeam() {
  try {
    const users = await api("listUsers", {}, session.token);
    $("#team-list").replaceChildren(
      ...users.map((u) => {
        const n = el("article", "team-person"),
          av = el("span", "avatar", u.name.charAt(0).toUpperCase()),
          info = el("div", "team-person-info");
        info.append(
          el("strong", "", u.name),
          el("span", "micro", u.email),
          el(
            "span",
            `status-badge ${u.active ? "badge-completed" : "badge-cancelled"}`,
            u.role === "owner"
              ? "Jefe"
              : u.active
                ? "Administrador activo"
                : "Sin acceso",
          ),
        );
        n.append(av, info);
        if (u.role === "admin") {
          const actions = el("div", "team-actions"),
            toggle = el(
              "button",
              "text-button",
              u.active ? "Desactivar" : "Activar",
            ),
            reset = el("button", "text-button", "Restablecer contraseña");
          toggle.addEventListener("click", async () => {
            if (
              !confirm(
                `${u.active ? "¿Desactivar" : "¿Activar"} el acceso de ${u.name}?`,
              )
            )
              return;
            toggle.disabled = true;
            try {
              await api(
                "setUserActive",
                { id: u.id, active: !u.active },
                session.token,
              );
              await loadTeam();
            } catch (e) {
              notify(e.message);
              toggle.disabled = false;
            }
          });
          reset.addEventListener("click", () => {
            resetUser = u;
            $("#reset-user-caption").textContent =
              `Nueva contraseña inicial para ${u.name}. Se cerrarán sus sesiones y deberá cambiarla al ingresar.`;
            $("#reset-form").reset();
            $("#reset-dialog").showModal();
          });
          actions.append(toggle, reset);
          n.append(actions);
        }
        return n;
      }),
    );
  } catch (e) {
    handleError(e);
  }
}
$("#team-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const b = $("#team-submit");
  busy(b, true, "Creando acceso…");
  try {
    const d = Object.fromEntries(new FormData(event.currentTarget)),
      email = d.email.trim().toLowerCase(),
      c = await api("challenge", { email });
    await api(
      "createUser",
      {
        email,
        name: d.name,
        passwordKey: await passwordKey(d.password, c.salt),
      },
      session.token,
    );
    $("#team-form").reset();
    notify(
      "Administrador creado. Comparte su contraseña por un canal privado.",
    );
    await loadTeam();
  } catch (e) {
    handleError(e);
  } finally {
    busy(b, false);
  }
});
$("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const b = $("#password-submit");
  busy(b, true, "Protegiendo tu cuenta…");
  try {
    const d = Object.fromEntries(new FormData(event.currentTarget)),
      c = await api("challenge", { email: session.user.email });
    const [currentKey, newKey] = await Promise.all([
      passwordKey(d.currentPassword, c.salt),
      passwordKey(d.newPassword, c.salt),
    ]);
    const r = await api(
      "changePassword",
      { currentKey, newKey },
      session.token,
    );
    session.user = r.user;
    storageSet(sessionKey, session, sessionStorage);
    $("#password-form").reset();
    notify("Contraseña actualizada. Las otras sesiones quedaron cerradas.");
    revision = "";
    await enter();
    $("#password-notice").textContent =
      "Tu contraseña está actualizada. Ya puedes operar.";
  } catch (e) {
    handleError(e);
  } finally {
    busy(b, false);
  }
});
$("#reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const b = $("#reset-submit"),
    password = new FormData(event.currentTarget).get("password");
  busy(b, true, "Restableciendo…");
  try {
    const c = await api("challenge", { email: resetUser.email });
    await api(
      "resetPassword",
      { id: resetUser.id, passwordKey: await passwordKey(password, c.salt) },
      session.token,
    );
    $("#reset-dialog").close();
    notify(
      "Contraseña restablecida. Comunícala al administrador por un canal privado.",
    );
  } catch (e) {
    notify(e.message);
  } finally {
    busy(b, false);
  }
});
if (session) {
  enter().catch((e) => showLogin(e.message));
} else if (demo) {
  api("demoLogin")
    .then((r) => {
      session = r;
      storageSet(sessionKey, r, sessionStorage);
      return enter();
    })
    .catch((e) => showLogin(e.message));
} else {
  checkInstallation();
}
