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
  token,
  storageGet,
  storageSet,
  statusLabels,
  serviceLabels,
  money,
  sound,
  poll,
  inCity,
  time,
} from "./core.js";
import { autocomplete } from "./maps.js";
banner();
wireDialogs();
const savedKey = demo ? "toc-demo-tracking" : "toc-tracking";
const draftKey = demo ? "toc-demo-draft" : "toc-draft";
let active = storageGet(savedKey),
  draft = storageGet(draftKey, null, sessionStorage),
  point = null,
  watchId = null,
  watcher = null,
  lastLocationSent = 0,
  lastPoint = null,
  sendingLocation = false;
const form = $("#request-form"),
  dialog = $("#tracking-dialog");
$("#privacy-button").addEventListener("click", () =>
  $("#privacy-dialog").showModal(),
);
$("#minimize-tracking").addEventListener("click", () => {
  dialog.close();
  $("#tracking-dock").hidden = false;
});
dialog.addEventListener("cancel", () => ($("#tracking-dock").hidden = false));
$("#tracking-dock").addEventListener("click", () => {
  dialog.showModal();
  $("#tracking-dock").hidden = true;
});
$("#tracking-sound").addEventListener("click", async () => {
  if (await sound.enable()) {
    sound.play("Las notificaciones de TOC TOC están activadas.");
    $("#tracking-sound").textContent = "Sonido y voz activados";
  } else
    notify("El navegador no permite audio. Revisa los permisos de sonido.");
});
$("#address").addEventListener("input", () => {
  point = null;
  stopGps();
  $("#tracking-permission").hidden = true;
  $("#location-status").textContent =
    "Usaremos la dirección que escribas. Añade una referencia para encontrarte mejor.";
});
$("#live-location").addEventListener("change", () => {
  if (!$("#live-location").checked) stopGps();
  else if (point?.locationMode === "gps") startGps();
});
$("#locate-button").addEventListener("click", () => {
  if (!navigator.geolocation)
    return notify(
      "Tu navegador no ofrece GPS. Escribe la dirección manualmente.",
    );
  if (!window.isSecureContext)
    return notify(
      "El GPS requiere HTTPS o localhost. Puedes escribir la dirección.",
    );
  const button = $("#locate-button");
  busy(button, true, "Encontrando tu ubicación…");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      busy(button, false);
      if (!setPoint(p)) return;
      $("#tracking-permission").hidden = false;
      if (!$("#address").value.trim())
        $("#address").value = `Ubicación GPS en ${config.city.name}`;
      if ($("#live-location").checked) startGps();
    },
    (e) => {
      busy(button, false);
      $("#location-status").textContent =
        {
          1: "No se autorizó el GPS. Escribe tu dirección para continuar.",
          2: "No pudimos encontrar tu ubicación. Escribe la dirección.",
          3: "El GPS está tardando. Puedes reintentar o escribir la dirección.",
        }[e.code] || "GPS no disponible. Escribe la dirección.";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
  );
});
function setPoint(p) {
  const next = {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: Math.round(p.coords.accuracy),
    locationAt: new Date(p.timestamp).toISOString(),
    locationMode: "gps",
  };
  if (!inCity(next)) {
    stopGps();
    point = null;
    $("#location-status").textContent =
      `Esta ubicación está fuera de la zona configurada de ${config.city.name}. No podemos solicitar un servicio desde allí.`;
    return false;
  }
  point = next;
  $("#location-status").textContent =
    `Ubicación encontrada · precisión aproximada de ${next.accuracy} m. ${next.accuracy > 150 ? "La precisión es baja; confirma la dirección y añade una referencia." : "Confirma la dirección o añade una referencia."}`;
  return true;
}
function startGps() {
  if (watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      if (setPoint(p) && active && $("#live-location").checked) sendLocation();
    },
    () => {
      $("#location-status").textContent =
        "El GPS dejó de actualizarse. Conservamos la última ubicación recibida.";
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
  );
}
function stopGps() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}
async function sendLocation() {
  if (
    !active ||
    !point ||
    sendingLocation ||
    Date.now() - lastLocationSent < 20000
  )
    return;
  if (
    lastPoint &&
    Math.abs(lastPoint.lat - point.lat) + Math.abs(lastPoint.lng - point.lng) <
      0.00015
  )
    return;
  sendingLocation = true;
  try {
    await api("updateLocation", {
      id: active.id,
      trackingToken: active.trackingToken,
      ...point,
    });
    lastLocationSent = Date.now();
    lastPoint = { ...point };
  } catch {
    /* Se reintentará con la siguiente actualización, sin bloquear al cliente. */
  } finally {
    sendingLocation = false;
  }
}
autocomplete($("#places-client"), config.city, (p) => {
  if (!inCity(p))
    return notify("Selecciona una dirección dentro de la zona del servicio.");
  stopGps();
  point = {
    ...p,
    accuracy: "",
    locationAt: new Date().toISOString(),
    locationMode: "manual_place",
  };
  $("#address").value = p.address;
  $("#tracking-permission").hidden = true;
  $("#location-status").textContent =
    "Dirección elegida en Google Maps. Confirma el número y añade una referencia.";
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#form-error").hidden = true;
  if (active) {
    dialog.showModal();
    return;
  }
  const button = $("#submit-request");
  busy(button, true, "Conectando con tu equipo…");
  sound.enable();
  $("#tracking-pill").textContent = "CONECTANDO CON TU EQUIPO";
  $("#tracking-title").textContent = "Dándole salida a tu solicitud.";
  $("#tracking-description").textContent =
    "Estamos enviando tu servicio. Confirmaremos aquí cuando quede registrado.";
  $("#journey-animation").className = "journey-animation state-pending";
  $("#tracking-details").replaceChildren();
  $("#tracking-connection").textContent = "";
  $("#keep-open").hidden = false;
  $("#cancel-request").hidden = true;
  $("#new-request").hidden = true;
  dialog.showModal();
  const fields = Object.fromEntries(new FormData(form));
  // Conserva el mismo identificador incluso tras un timeout: el servidor deduplica.
  if (!draft) {
    draft = { id: crypto.randomUUID(), trackingToken: token() };
    storageSet(draftKey, draft, sessionStorage);
  }
  try {
    const result = await api("createRequest", {
      ...fields,
      ...draft,
      cityId: config.city.id,
      ...(point || {}),
      website: "",
    });
    active = {
      id: result.id,
      trackingToken: draft.trackingToken,
      lastStatus: "pending",
      notifiedStatus: "",
      sharingLocation:
        point?.locationMode === "gps" && $("#live-location").checked,
    };
    storageSet(savedKey, active);
    draft = null;
    storageSet(draftKey, null, sessionStorage);
    renderTracking(result);
    dialog.showModal();
    beginTracking();
  } catch (e) {
    dialog.close();
    $("#tracking-dock").hidden = true;
    $("#form-error").textContent = e.message;
    $("#form-error").hidden = false;
  } finally {
    busy(button, false);
  }
});
function beginTracking() {
  watcher?.stop();
  watcher = poll(async () => {
    if (!active) return;
    try {
      const order = await api("trackRequest", {
        id: active.id,
        trackingToken: active.trackingToken,
      });
      renderTracking(order);
      $("#tracking-connection").textContent =
        `Última comprobación: ${time(Date.now())}. Actualización automática.`;
    } catch (e) {
      $("#tracking-connection").textContent =
        e.code === "NOT_FOUND"
          ? "Este seguimiento ya no está disponible. Puedes iniciar una nueva solicitud."
          : `${e.message} Reintentando automáticamente.`;
      if (e.code === "NOT_FOUND") {
        watcher?.stop();
        stopGps();
        $("#new-request").hidden = false;
        $("#cancel-request").hidden = true;
      }
      throw e;
    }
  }, config.pollMs);
}
function renderTracking(o) {
  if (!active) return;
  const terminal = ["completed", "cancelled"].includes(o.status);
  const text = {
    pending: [
      "Tu solicitud ya está en la ruta.",
      "El equipo está revisando tu servicio. Mantén esta página abierta para recibir la confirmación.",
    ],
    accepted: [
      "¡Tu domiciliario está en camino!",
      "El equipo aceptó tu servicio y asignó un domiciliario. Aquí tienes sus datos para coordinar la recogida.",
    ],
    completed: [
      "Un pendiente menos. Listo.",
      "Tu servicio fue marcado como completado. Gracias por moverte con TOC TOC.",
    ],
    cancelled: [
      "Solicitud cancelada",
      o.cancelReason ||
        "Este servicio fue cancelado. Si lo necesitas, puedes solicitar otro.",
    ],
  }[o.status];
  if (!text) return;
  $("#tracking-title").textContent = text[0];
  $("#tracking-description").textContent = text[1];
  $("#tracking-pill").textContent = statusLabels[o.status].toLocaleUpperCase();
  $("#journey-animation").className = `journey-animation state-${o.status}`;
  const step = { pending: 0, accepted: 1, completed: 2, cancelled: -1 }[
    o.status
  ];
  $$("#tracking-steps span").forEach((n, i) =>
    n.classList.toggle("active", i <= step),
  );
  $("#keep-open").hidden = terminal;
  $("#cancel-request").hidden = o.status !== "pending";
  $("#new-request").hidden = !terminal;
  const details = $("#tracking-details");
  details.replaceChildren();
  const add = (label, val) => {
    if (val === "" || val == null) return;
    const r = el("div", "detail-row");
    r.append(el("span", "", label), el("strong", "", val));
    details.append(r);
  };
  add("Solicitud", `#${o.id.slice(0, 8).toUpperCase()}`);
  add("Servicio", serviceLabels[o.service]);
  add("Recogida", o.address);
  add("Tu domiciliario", o.courier);
  if (o.fee !== "" && o.fee != null) add("Tarifa informada", money(o.fee));
  if (o.courierPhone) {
    const a = el(
      "a",
      "button button-secondary",
      `Llamar a ${o.courier || "tu domiciliario"}`,
    );
    a.href = `tel:${o.courierPhone.replace(/[^+\d]/g, "")}`;
    details.append(a);
  }
  if (o.status === "accepted" && active.notifiedStatus !== "accepted") {
    sound.play(
      "TOC TOC. Tu domiciliario está en camino. Tu servicio fue aceptado.",
    );
    if (sound.enabled) active.notifiedStatus = "accepted";
    notify("¡Tu servicio fue aceptado! Tu domiciliario está en camino.");
  }
  if (o.status === "completed" && active.lastStatus !== "completed")
    sound.play(
      "Tu servicio de TOC TOC fue completado. Gracias por confiar en nosotros.",
    );
  active.lastStatus = o.status;
  storageSet(savedKey, active);
  if (terminal) {
    stopGps();
    watcher?.stop();
  }
}
$("#cancel-request").addEventListener("click", async () => {
  if (!active || !confirm("¿Quieres cancelar esta solicitud?")) return;
  const b = $("#cancel-request");
  busy(b, true, "Cancelando…");
  try {
    const o = await api("cancelRequest", {
      id: active.id,
      trackingToken: active.trackingToken,
    });
    renderTracking(o);
  } catch (e) {
    notify(e.message);
    watcher?.refresh();
  } finally {
    busy(b, false);
  }
});
$("#new-request").addEventListener("click", () => {
  watcher?.stop();
  stopGps();
  active = null;
  storageSet(savedKey, null);
  dialog.close();
  $("#tracking-dock").hidden = true;
  form.reset();
  point = null;
  $("#tracking-permission").hidden = true;
  $("#location-status").textContent = "También puedes escribir tu dirección.";
  $("#solicitar").scrollIntoView({ behavior: "smooth" });
});
window.addEventListener("pagehide", stopGps);
if (active) {
  dialog.showModal();
  beginTracking();
  if (active.sharingLocation && navigator.permissions)
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") startGps();
      })
      .catch(() => {});
}
