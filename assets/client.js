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
  distance,
} from "./core.js?v=1.3.4";
import { mapPreview, reverseAddress, searchAddresses } from "./maps.js?v=1.3.4";
import { initPwa, syncPush, restoreDeviceTracking } from "./pwa.js?v=1.3.4";
banner();
wireDialogs();
const savedKey = demo ? "toc-demo-tracking" : "toc-tracking",
  draftKey = demo ? "toc-demo-draft" : "toc-draft",
  profileKey = demo ? "toc-demo-contact" : "toc-contact";
const form = $("#request-form"),
  requestDialog = $("#request-dialog"),
  trackingDialog = $("#tracking-dialog");
const restoredTracking = demo ? null : await restoreDeviceTracking();
if (restoredTracking) storageSet(savedKey, restoredTracking);
let active = storageGet(savedKey),
  draft = storageGet(draftKey, null, sessionStorage),
  point = null,
  watchId = null,
  watcher = null,
  gpsGeneration = 0,
  pointGeneration = 0,
  lookupPending = null,
  lastLocationSent = 0,
  lastSentPoint = null,
  sendingLocation = false,
  lastMapKey = "",
  lastTrackingMapKey = "",
  trackedOrder = null;
initPwa({
  role: "client",
  target: () =>
    active ? { id: active.id, trackingToken: active.trackingToken } : null,
});
window.addEventListener("toc:push-state", (event) => {
  if (event.detail.role !== "client") return;
  if (event.detail.enabled) {
    $("#keep-open-title").textContent = "Avisos activados";
    $("#keep-open-description").textContent =
      "Puedes salir de esta página. Tu dispositivo debe permitir los avisos; aquí seguirás viendo el estado del servicio.";
  }
});
window.addEventListener("toc:audio-state", () => {
  $("#tracking-sound").textContent = sound.enabled
    ? "Probar sonido y voz"
    : sound.pending
      ? "Toca para oír el aviso pendiente"
      : "Activar sonido y voz";
});
function launchState(state) {
  $("#request-launch").dataset.state = state;
  $("#launch-label").textContent = active
    ? state === "accepted"
      ? "Ver domiciliario"
      : state === "completed"
        ? "Ver pedido realizado"
        : "Ver mi servicio"
    : "Solicitar domicilio";
}
function locateBusy(state) {
  const b = $("#locate-button");
  b.disabled = state;
  b.setAttribute("aria-busy", String(state));
  $("span", b).textContent = state
    ? "Afinando tu ubicación…"
    : "Mejorar mi GPS";
}
function readyToSend() {
  $("#submit-request").disabled =
    !$("#address").value.trim() || !!$("#submit-request").dataset.sending;
}
function mapPlaceholder(manual = false) {
  const box = el("div", manual ? "map-placeholder-manual" : "map-loading");
  const target = el("span", manual ? "manual-target" : "scan-target");
  target.append(icon(manual ? "pin" : "target"));
  box.append(
    target,
    el("strong", "", manual ? "Ubica tu dirección" : "Encontrando tu punto…"),
    el(
      "span",
      "",
      manual
        ? "Escribe calle, número y barrio. Pulsa Ubicar para ver el lugar aquí."
        : "Autoriza la ubicación en tu navegador.",
    ),
  );
  $("#client-map").replaceChildren(box);
  lastMapKey = "";
}
function mountMap(value) {
  const key =
    value.lat != null && value.lat !== ""
      ? `${value.lat}:${value.lng}`
      : `address:${value.address || ""}`;
  if (!requestDialog.open || key === lastMapKey) return;
  lastMapKey = key;
  $("#client-map").replaceChildren(
    mapPreview(value, config.city, { eager: true }),
  );
}
function gpsText(p) {
  return `GPS ±${p.accuracy} m. ${p.accuracy > 50 ? "La posición puede abarcar varias casas. Mejora el GPS o añade una referencia." : "Confirma que el lugar del mapa corresponda a tu recogida."}`;
}
function showPoint(p) {
  $("#detected-address").textContent = p.address;
  $("#address").value = p.address;
  $("#location-chip").textContent =
    p.locationMode === "gps" ? "GPS COMPARTIDO" : "PUNTO CONFIRMADO";
  $("#address-source").textContent =
    p.locationMode === "gps"
      ? "DIRECCIÓN DE TU UBICACIÓN"
      : "DIRECCIÓN ELEGIDA";
  $("#location-status").textContent =
    p.locationMode === "gps"
      ? gpsText(p)
      : "El equipo recibirá este mismo punto y esta dirección.";
  $("#tracking-permission").hidden = p.locationMode !== "gps";
  mountMap(p);
  readyToSend();
}
function stopGps() {
  gpsGeneration++;
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  locateBusy(false);
}
async function acceptGps(position, generation) {
  if (generation !== gpsGeneration) return;
  const next = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Math.round(position.coords.accuracy),
    locationAt: new Date(position.timestamp).toISOString(),
    locationMode: "gps",
  };
  if (!inCity(next)) {
    stopGps();
    point = null;
    $("#location-chip").textContent = "FUERA DE LA ZONA";
    $("#location-status").textContent =
      `Este GPS está fuera de la zona configurada de ${config.city.name}. Confirma una dirección de recogida dentro de la zona.`;
    showManual();
    return;
  }
  if (
    point?.locationMode === "gps" &&
    distance(point, next) < 0.02 &&
    next.accuracy >= point.accuracy
  ) {
    locateBusy(false);
    if (requestDialog.open) showPoint(point);
    return;
  }
  const epoch = ++pointGeneration;
  next.address = `Punto GPS · ${next.lat.toFixed(6)}, ${next.lng.toFixed(6)}`;
  point = next;
  showPoint(next);
  locateBusy(false);
  launchState("ready");
  $("#location-status").textContent =
    `${gpsText(next)} Buscando el nombre de la calle…`;
  const lookup = (async () => {
    try {
      const found = await reverseAddress(next, config.city);
      if (epoch !== pointGeneration || point?.locationMode !== "gps") return;
      point = { ...next, address: found.address };
      showPoint(point);
    } catch {
      if (epoch === pointGeneration)
        $("#location-status").textContent =
          `${gpsText(next)} La calle no pudo identificarse ahora. Tu punto GPS se conserva; puedes escribir la dirección o añadir una referencia.`;
    } finally {
      if (epoch === pointGeneration && active && $("#live-location").checked)
        sendLocation();
    }
  })();
  lookupPending = lookup;
  lookup.finally(() => {
    if (lookupPending === lookup) lookupPending = null;
  });
}
function gpsError(error, generation) {
  if (generation !== gpsGeneration) return;
  locateBusy(false);
  launchState("ready");
  if (point) {
    $("#location-status").textContent =
      `${gpsText(point)} Conservamos el último punto recibido. Puedes volver a mejorar el GPS.`;
    return;
  }
  $("#location-chip").textContent = "CONFIRMA TU DIRECCIÓN";
  $("#location-status").textContent =
    {
      1: "No se autorizó la ubicación. Puedes escribir tu dirección aquí mismo.",
      2: "No pudimos obtener el GPS. Escribe tu dirección para continuar.",
      3: "El GPS está tardando. Reintenta o escribe tu dirección.",
    }[error.code] || "Escribe tu dirección para continuar.";
  if (!point) {
    mapPlaceholder(true);
    showManual();
  }
}
function requestGps() {
  if (!navigator.geolocation || !window.isSecureContext) {
    $("#location-status").textContent =
      "El GPS requiere un navegador con ubicación y una conexión segura. Puedes escribir tu dirección.";
    showManual();
    return;
  }
  stopGps();
  const generation = gpsGeneration;
  locateBusy(true);
  launchState("locating");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      if (generation !== gpsGeneration) return;
      acceptGps(p, generation);
      if ($("#live-location").checked)
        watchId = navigator.geolocation.watchPosition(
          (next) => acceptGps(next, generation),
          (e) => gpsError(e, generation),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
        );
    },
    (e) => gpsError(e, generation),
    { enableHighAccuracy: true, timeout: 14000, maximumAge: 5000 },
  );
}
function showManual() {
  $("#manual-address").hidden = false;
  readyToSend();
}
function beginRequest() {
  sound.enable();
  if (active) {
    trackingDialog.showModal();
    return;
  }
  requestDialog.showModal();
  lastMapKey = "";
  $("#form-error").hidden = true;
  const saved = storageGet(profileKey);
  if (saved) {
    form.elements.name.value = saved.name || "";
    form.elements.phone.value = saved.phone || "";
    $("#remember-contact").checked = true;
  }
  readyToSend();
  if (point) {
    showPoint(point);
    if (point.locationMode === "gps") requestGps();
  } else {
    $("#detected-address").textContent = "Esperando tu ubicación";
    $("#location-chip").textContent = "ACTIVANDO GPS";
    mapPlaceholder();
    requestGps();
  }
}
$("#request-launch").addEventListener("click", beginRequest);
$("#close-request").addEventListener("click", () => requestDialog.close());
requestDialog.addEventListener("close", () => {
  if (requestDialog.open) return;
  if (!active) stopGps();
  launchState(active ? active.lastStatus : "idle");
});
$("#locate-button").addEventListener("click", requestGps);
$("#manual-address-button").addEventListener("click", () => {
  showManual();
  $("#address").focus();
});
$("#address").addEventListener("input", () => {
  stopGps();
  pointGeneration++;
  point = null;
  if (lastMapKey !== "manual") {
    mapPlaceholder(true);
    lastMapKey = "manual";
  }
  $("#tracking-permission").hidden = true;
  $("#location-chip").textContent = "DIRECCIÓN MANUAL";
  $("#address-source").textContent = "DIRECCIÓN DE RECOGIDA";
  $("#detected-address").textContent =
    $("#address").value || "Escribe tu dirección";
  $("#location-status").textContent =
    `La consulta se realiza dentro de ${config.city.name}. Pulsa Ubicar para confirmar su punto.`;
  $("#places-client").replaceChildren();
  readyToSend();
});
$("#search-address").addEventListener("click", async () => {
  const b = $("#search-address");
  busy(b, true, "Buscando…");
  const input = $("#address").value.trim();
  try {
    const results = await searchAddresses(input, config.city);
    const choose = (p) => {
      if (!inCity(p))
        return notify("Elige una dirección dentro de la zona del servicio.");
      stopGps();
      pointGeneration++;
      point = {
        ...p,
        accuracy: "",
        locationAt: new Date().toISOString(),
        locationMode: "manual_place",
      };
      showPoint(point);
      $("#places-client").replaceChildren();
    };
    if (results.length === 1) choose(results[0]);
    else {
      $("#places-client").replaceChildren(
        el("p", "field-help", "Selecciona la dirección correcta."),
        ...results.map((p) => {
          const b = el("button", "address-result", p.address);
          b.type = "button";
          b.addEventListener("click", () => choose(p));
          return b;
        }),
      );
    }
  } catch (e) {
    $("#location-status").textContent = e.message;
  } finally {
    busy(b, false);
  }
});
$("#live-location").addEventListener("change", () => {
  if (active) {
    active.sharingLocation = $("#live-location").checked;
    storageSet(savedKey, active);
  }
  if (!$("#live-location").checked) stopGps();
  else requestGps();
});
$("#privacy-button").addEventListener("click", () =>
  $("#privacy-dialog").showModal(),
);
$("#minimize-tracking").addEventListener("click", () => {
  trackingDialog.close();
  $("#request-launch").focus();
});
$("#tracking-sound").addEventListener("click", async () => {
  if (await sound.enable()) {
    sound.play("Las notificaciones de TocToc están activadas.");
    $("#tracking-sound").textContent = "Sonido y voz activados";
  } else notify("Revisa los permisos de sonido de tu navegador.");
});

async function sendLocation() {
  if (
    !active ||
    point?.locationMode !== "gps" ||
    sendingLocation ||
    Date.now() - lastLocationSent < 20000 ||
    !$("#live-location").checked
  )
    return;
  if (lastSentPoint && distance(lastSentPoint, point) < 0.02) return;
  const snapshot = { ...point };
  sendingLocation = true;
  try {
    const result = await api("updateLocation", {
      id: active.id,
      trackingToken: active.trackingToken,
      ...snapshot,
    });
    if (result.updated) {
      lastLocationSent = Date.now();
      lastSentPoint = snapshot;
      active.pickup = snapshot;
      storageSet(savedKey, active);
    }
  } catch {
    /* La siguiente posición vuelve a intentarlo. */
  } finally {
    sendingLocation = false;
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (active) {
    requestDialog.close();
    trackingDialog.showModal();
    return;
  }
  $("#form-error").hidden = true;
  const b = $("#submit-request");
  b.dataset.sending = "1";
  busy(b, true, "Activando tu servicio…");
  sound.enable();
  launchState("sending");
  try {
    if (lookupPending) await lookupPending;
    const fields = Object.fromEntries(new FormData(form));
    if (!fields.address.trim())
      throw new Error(
        "Confirma tu dirección o autoriza el GPS para continuar.",
      );
    if (!draft) {
      draft = { id: crypto.randomUUID(), trackingToken: token() };
      storageSet(draftKey, draft, sessionStorage);
    }
    const pickup = { address: fields.address, ...(point || {}) };
    requestDialog.close();
    $("#tracking-pill").textContent = "ACTIVANDO TU SERVICIO";
    $("#tracking-title").textContent =
      "Tu punto. Nuestro siguiente movimiento.";
    $("#tracking-description").textContent =
      "Estamos registrando la solicitud con el equipo.";
    $("#journey-animation").className = "journey-animation state-pending";
    $("#tracking-details").replaceChildren();
    $("#keep-open").hidden = false;
    $("#cancel-request").hidden = true;
    $("#new-request").hidden = true;
    $("#tracking-location").hidden = true;
    trackingDialog.showModal();
    const result = await api("createRequest", {
      ...fields,
      ...draft,
      ...pickup,
      cityId: config.city.id,
      consent: true,
      website: "",
    });
    active = {
      id: result.id,
      trackingToken: draft.trackingToken,
      lastStatus: "pending",
      notifiedStatus: "",
      sharingLocation:
        point?.locationMode === "gps" && $("#live-location").checked,
      pickup,
    };
    storageSet(savedKey, active);
    syncPush();
    storageSet(
      profileKey,
      $("#remember-contact").checked
        ? { name: fields.name, phone: fields.phone }
        : null,
    );
    draft = null;
    storageSet(draftKey, null, sessionStorage);
    renderTracking(result);
    beginTracking();
    if (active.sharingLocation) requestGps();
  } catch (e) {
    trackingDialog.close();
    requestDialog.showModal();
    $("#form-error").textContent = e.message;
    $("#form-error").hidden = false;
    launchState("ready");
  } finally {
    delete b.dataset.sending;
    busy(b, false);
    readyToSend();
  }
});
function beginTracking() {
  watcher?.stop();
  watcher = poll(async () => {
    if (!active) return;
    try {
      const o = await api("trackRequest", {
        id: active.id,
        trackingToken: active.trackingToken,
      });
      renderTracking(o);
      $("#tracking-connection").textContent =
        `Última comprobación: ${time(Date.now())}. Actualización automática.`;
    } catch (e) {
      $("#tracking-connection").textContent =
        e.code === "NOT_FOUND"
          ? "Este seguimiento ya no está disponible. Puedes iniciar otra solicitud."
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
function updateTrackingMap() {
  if (!trackedOrder || !$("#tracking-location").open) return;
  const key = `${trackedOrder.lat ?? ""}:${trackedOrder.lng ?? ""}:${trackedOrder.address}`;
  if (key === lastTrackingMapKey) return;
  lastTrackingMapKey = key;
  $("#tracking-map").replaceChildren(mapPreview(trackedOrder, config.city));
}
$("#tracking-location").addEventListener("toggle", updateTrackingMap);
function renderTracking(o) {
  if (!active) return;
  const terminal = ["completed", "cancelled"].includes(o.status),
    text = {
      pending: [
        "Tu solicitud ya está en la ruta.",
        "El equipo está revisando tu servicio. Mantén esta página abierta para recibir la confirmación.",
      ],
      accepted: [
        "¡Tu domiciliario está en camino!",
        "El equipo aceptó tu servicio. Aquí tienes sus datos para coordinar la recogida.",
      ],
      completed: [
        "Pedido exitosamente realizado.",
        "Tu servicio fue marcado como completado. Gracias por moverte con TocToc.",
      ],
      cancelled: [
        "Solicitud cancelada",
        o.cancelReason || "Puedes solicitar otro servicio cuando lo necesites.",
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
  trackedOrder = { ...(active.pickup || {}), ...o };
  $("#tracking-location").hidden = false;
  updateTrackingMap();
  const details = $("#tracking-details");
  details.replaceChildren();
  const add = (label, value) => {
    if (value === "" || value == null) return;
    const row = el("div", "detail-row");
    row.append(el("span", "", label), el("strong", "", value));
    details.append(row);
  };
  add("Solicitud", `#${String(o.id).slice(0, 8).toUpperCase()}`);
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
    a.href = `tel:+57${String(o.courierPhone)
      .replace(/[^\d]/g, "")
      .replace(/^57(?=3\d{9}$)/, "")}`;
    details.append(a);
  }
  if (o.status === "accepted") {
    sound.alert(
      "client:" + o.id + ":accepted",
      "TocToc. Tu domiciliario está en camino. Tu servicio fue aceptado.",
    );
    if (active.lastStatus !== "accepted")
      notify("¡Tu domiciliario está en camino!");
  }
  if (o.status === "completed")
    sound.alert(
      "client:" + o.id + ":completed",
      "Tu servicio de TocToc fue completado. Gracias por confiar en nosotros.",
    );
  active.lastStatus = o.status;
  launchState(o.status);
  if (terminal) {
    active.sharingLocation = false;
    stopGps();
    watcher?.stop();
  }
  storageSet(savedKey, active);
}
$("#cancel-request").addEventListener("click", async () => {
  if (!active || !confirm("¿Quieres cancelar esta solicitud?")) return;
  const b = $("#cancel-request");
  busy(b, true, "Cancelando…");
  try {
    renderTracking(
      await api("cancelRequest", {
        id: active.id,
        trackingToken: active.trackingToken,
      }),
    );
  } catch (e) {
    $("#tracking-connection").textContent = e.message;
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
  trackingDialog.close();
  form.reset();
  point = null;
  pointGeneration++;
  lastMapKey = "";
  lastTrackingMapKey = "";
  $("#address").value = "";
  $("#manual-address").hidden = true;
  $("#tracking-permission").hidden = true;
  launchState("idle");
  beginRequest();
});
window.addEventListener("pagehide", stopGps);
window.addEventListener("toc:service-update", () => watcher?.refresh());
if (active) {
  launchState(active.lastStatus);
  trackingDialog.showModal();
  beginTracking();
  syncPush();
  if (active.sharingLocation && navigator.permissions)
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") requestGps();
      })
      .catch(() => {});
} else launchState("idle");
