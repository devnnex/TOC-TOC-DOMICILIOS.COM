import {
  api,
  config,
  demo,
  notify,
  sound,
  storageGet,
  storageSet,
} from "./core.js?v=1.3.6";
import "./pwa-store.js?v=1.3.6";
const ROOT = new URL("../", import.meta.url).href,
  store = globalThis.TocPwaStore;
let registration,
  installPrompt,
  role = "client",
  targetProvider = () => null,
  sessionProvider = () => "",
  boundTarget = "",
  binding,
  enabling,
  autoInfo,
  preparing;
let autoAttempted = storageGet(
  "toc-notification-prompted",
  false,
  sessionStorage,
);
const installed = () =>
  matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true;
const ios = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const supported = () =>
  isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const emit = (detail) => {
  document.querySelectorAll("[data-notification-control]").forEach((n) => {
    const ready = detail.enabled === true || detail.pending === true;
    n.dataset.ready = String(ready);
    n.title = ready ? "Notificaciones listas" : "Notificaciones";
  });
  window.dispatchEvent(new CustomEvent("toc:push-state", { detail }));
};
function status(message) {
  document
    .querySelectorAll("[data-push-status]")
    .forEach((n) => (n.textContent = message));
}
function showHealth(health) {
  let message =
    "Este dispositivo está vinculado. Falta comprobar la recepción de un aviso.";
  if (health.last?.state === "retry" || health.last?.state === "failed")
    message = /401|403|AUTHORIZATION/.test(health.last.error)
      ? "No pudimos entregar el aviso. Puedes volver a comprobar las notificaciones."
      : "No pudimos entregar el último aviso. Pulsa Probar un aviso para comprobarlo de nuevo.";
  else if (health.last?.state === "skipped")
    message =
      "El aviso no tenía un dispositivo disponible. Vuelve a activar los avisos.";
  else if (
    health.last?.state === "sent" &&
    (!health.shownAt || health.shownAt < health.last.at)
  )
    message =
      "Aviso enviado. Estamos esperando la confirmación de este dispositivo.";
  else if (health.shownAt)
    message =
      "Última notificación mostrada en este dispositivo: " +
      new Date(health.shownAt).toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      }) +
      ".";
  status(message);
  return health;
}
async function verifyGrant(grant, endpoint) {
  return showHealth(
    await api("pushStatus", { id: grant.id, token: grant.token, endpoint }),
  );
}
function base64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function bytes(value) {
  return Uint8Array.from(
    atob(
      value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
}
async function ensureRegistration() {
  if (!registration)
    throw new Error(
      "No pudimos preparar los avisos. Recarga la aplicación y vuelve a intentarlo.",
    );
  if (registration.active) return registration;
  return navigator.serviceWorker.ready;
}
async function bind(force = false) {
  if (demo || !supported() || Notification.permission !== "granted")
    return false;
  const target = targetProvider();
  if (!target) return false;
  const key = role + ":" + (target.id || target.userId || "");
  if (boundTarget === key && !force) return true;
  if (binding) {
    await binding;
    return boundTarget === key && !force ? true : bind(force);
  }
  const registerTarget = async () => {
    const reg = await ensureRegistration(),
      sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const keys = sub.toJSON?.().keys;
    const previous =
      (await store.get(
        ROOT,
        role === "client" ? "client-grant:" + target.id : "grant:admin",
      )) || (await store.get(ROOT, "grant:" + role));
    if (
      previous &&
      previous.targetKey === key &&
      previous.endpoint === sub.endpoint &&
      new Date(previous.expiresAt).getTime() > Date.now() + 3600000
    ) {
      try {
        const health = await verifyGrant(previous, sub.endpoint);
        if (keys && !health.encrypted)
          throw Object.assign(
            new Error("Actualizando la vinculación del dispositivo."),
            { code: "UNAUTHORIZED" },
          );
        if (role === "client")
          await store.put(ROOT, "client-grant:" + target.id, previous);
        boundTarget = key;
        emit({ enabled: true, role });
        return true;
      } catch (error) {
        if (!["UNAUTHORIZED", "NOT_FOUND"].includes(error.code)) throw error;
      }
    }
    const grant = await api(
      "subscribePush",
      { scope: role, ...target, endpoint: sub.endpoint, keys },
      sessionProvider(),
    );
    const dispatch = grant.pushDispatch;
    delete grant.pushDispatch;
    grant.targetKey = key;
    grant.endpoint = sub.endpoint;
    await store.put(ROOT, "grant:" + role, grant);
    if (role === "client")
      await store.put(ROOT, "client-grant:" + target.id, grant);
    if (dispatch) api("dispatchPush", dispatch).catch(() => {});
    await verifyGrant(grant, sub.endpoint);
    boundTarget = key;
    emit({ enabled: true, role });
    return true;
  };
  binding = (
    navigator.locks
      ? navigator.locks.request("toc-push:" + ROOT + ":" + key, registerTarget)
      : registerTarget()
  ).finally(() => (binding = null));
  return binding;
}
export function enablePush(options = {}) {
  if (enabling) return enabling;
  enabling = activatePush(options.automatic === true).finally(
    () => (enabling = null),
  );
  return enabling;
}
async function activatePush(automatic = false) {
  if (demo) {
    status("Los avisos fuera de la página se activan en la aplicación real.");
    notify(
      "Estás en la demostración. Activa los avisos desde la aplicación real.",
    );
    return false;
  }
  if (ios() && !installed()) {
    status("Añade TocToc a tu pantalla de inicio para recibir notificaciones.");
    notify(
      "En iPhone: Compartir → Añadir a pantalla de inicio. Después abre TocToc.",
    );
    return false;
  }
  if (!supported()) {
    status(
      "Este navegador no permite avisos fuera de la página. Puedes mantenerla abierta.",
    );
    return false;
  }
  // Starting the prompt never means consent. Only the browser's grant counts.
  if (Notification.permission === "default") {
    autoAttempted = true;
    storageSet("toc-notification-prompted", true, sessionStorage);
  }
  try {
    status("Preparando y comprobando los avisos de este dispositivo…");
    const permissionPromise =
      Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
    if ((await permissionPromise) !== "granted") {
      status(
        "Los avisos están bloqueados. Puedes habilitarlos en los permisos del navegador.",
      );
      return false;
    }
    const reg = await ensureRegistration();
    const info = await api("pushInfo");
    if (!info.available)
      throw new Error(
        "No pudimos preparar las notificaciones. Vuelve a intentar.",
      );
    if (!info.enabled) {
      throw new Error(
        "Las notificaciones todavía no están disponibles. Vuelve a intentar.",
      );
    }
    let subscription = await reg.pushManager.getSubscription();
    if (
      subscription?.options?.applicationServerKey &&
      base64(new Uint8Array(subscription.options.applicationServerKey)) !==
        info.publicKey
    ) {
      await subscription.unsubscribe();
      subscription = null;
      boundTarget = "";
    }
    if (!subscription)
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes(info.publicKey),
      });
    await store.put(ROOT, "config", { apiUrl: config.apiUrl, base: ROOT });
    const ready = await bind(true);
    if (!ready) {
      status("Avisos preparados. Se vincularán cuando solicites un servicio.");
      emit({ enabled: false, role, pending: true });
    }
    document.querySelectorAll("[data-enable-push]").forEach((n) => {
      if (!n.hasAttribute("data-notification-control"))
        n.textContent = ready
          ? "Comprobar notificaciones"
          : "Permitir notificaciones";
    });
    if (role === "client") repairPreviousServices(subscription).catch(() => {});
    return true;
  } catch (error) {
    status(
      error.code === "UNKNOWN_ACTION"
        ? "Las notificaciones necesitan una actualización. Puedes seguir viendo tu pedido aquí."
        : ["UNAUTHORIZED", "PUSH_SETUP_REQUIRED"].includes(error.code)
          ? "No pudimos preparar las notificaciones. Vuelve a intentar."
          : error.message,
    );
    if (!automatic)
      notify(
        error.code === "UNKNOWN_ACTION"
          ? "Las notificaciones necesitan una actualización. Puedes seguir viendo tu pedido aquí."
          : ["UNAUTHORIZED"].includes(error.code)
            ? "Los avisos necesitan completar su activación."
            : error.message,
      );
    return false;
  }
}
async function repairPreviousServices(subscription) {
  const saved = await store.entries(ROOT, "client-grant:");
  for (const [key, old] of saved) {
    if (
      old.endpoint === subscription.endpoint ||
      new Date(old.expiresAt).getTime() <= Date.now()
    )
      continue;
    const tracking = await store.get(ROOT, "client-tracking:" + old.requestId);
    if (!tracking) continue;
    try {
      const grant = await api("subscribePush", {
        scope: "client",
        id: tracking.id,
        trackingToken: tracking.trackingToken,
        endpoint: subscription.endpoint,
        keys: subscription.toJSON?.().keys,
      });
      const dispatch = grant.pushDispatch;
      delete grant.pushDispatch;
      grant.endpoint = subscription.endpoint;
      grant.targetKey = "client:" + tracking.id;
      await store.put(ROOT, key, grant);
      if (dispatch) api("dispatchPush", dispatch).catch(() => {});
    } catch {
      /* A removed/expired service must not block the current one. */
    }
  }
}
export async function syncPush() {
  try {
    const target = targetProvider();
    if (role === "client" && target)
      await store.put(ROOT, "client-tracking:" + target.id, {
        ...target,
        savedAt: Date.now(),
      });
    await prepareAutomaticPush();
    return await bind();
  } catch (error) {
    emit({ enabled: false, role });
    status(
      error.code === "UNKNOWN_ACTION"
        ? "El equipo debe actualizar el servicio para confirmar tus avisos."
        : error.message,
    );
    return false;
  }
}
export async function restoreDeviceTracking() {
  const id = new URLSearchParams(location.hash.slice(1)).get("service");
  if (!id || !/^[a-f0-9-]{32,40}$/i.test(id)) return null;
  try {
    const saved = await store.get(ROOT, "client-tracking:" + id);
    if (saved && Date.now() - saved.savedAt < 30 * 86400000)
      return { id: saved.id, trackingToken: saved.trackingToken };
  } catch {}
  return null;
}
function eligibleForPush() {
  if (demo || !supported() || (ios() && !installed()) || !autoInfo?.available)
    return false;
  const target = targetProvider();
  if (role === "admin" && (!target || target.mustChangePassword)) return false;
  return autoInfo.enabled;
}
async function prepareAutomaticPush() {
  if (demo || !supported() || (ios() && !installed()) || !registration) return;
  if (preparing) return preparing;
  preparing = (async () => {
    // Fetch availability before a gesture; do not consume activation on a fetch.
    if (!autoInfo?.enabled) autoInfo = await api("pushInfo");
    if (!autoInfo.available) {
      status("No pudimos preparar las notificaciones. Vuelve a intentar.");
      emit({ enabled: false, role });
    }
    if (eligibleForPush() && Notification.permission === "granted")
      await enablePush({ automatic: true });
    document.body.dataset.notificationsReady = String(eligibleForPush());
  })()
    .catch(() => {})
    .finally(() => (preparing = null));
  return preparing;
}
function activateOnInteraction(event) {
  if (!event.isTrusted || navigator.userActivation?.isActive === false) return;
  if (
    event.type === "keydown" &&
    (event.repeat || !["Enter", " "].includes(event.key))
  )
    return;
  if (!sound.enabled) sound.enable();
  if (
    !eligibleForPush() ||
    Notification.permission !== "default" ||
    autoAttempted
  )
    return;
  // The pickup action already requests GPS. Do not stack two native prompts.
  if (
    event.target?.closest?.(
      "#request-launch,#locate-button,[data-install-app],[data-enable-push],[data-test-push],#sound-button,a",
    )
  )
    return;
  enablePush({ automatic: true });
}
export async function forgetPush() {
  const previous = await store.get(ROOT, "grant:" + role).catch(() => null);
  boundTarget = "";
  if (previous) {
    await api("unsubscribePush", {
      id: previous.id,
      token: previous.token,
    }).catch(() => {});
    await store.remove(ROOT, "grant:" + role).catch(() => {});
  }
  emit({ enabled: false, role });
}
export async function testPush() {
  try {
    if (!(await enablePush())) return;
    const grant = await store.get(ROOT, "grant:" + role);
    if (!grant) return status("Solicita un servicio para vincular sus avisos.");
    await api("testPush", { id: grant.id, token: grant.token });
    status("Prueba enviada. Revisa los avisos de este dispositivo.");
  } catch (error) {
    status(error.message);
  }
}
export async function checkPush() {
  try {
    if (!(await enablePush())) return;
    const grant = await store.get(ROOT, "grant:" + role);
    if (grant) await verifyGrant(grant, grant.endpoint);
  } catch (error) {
    status(
      error.code === "UNKNOWN_ACTION"
        ? "El equipo debe actualizar el servicio de avisos."
        : error.message,
    );
  }
}
export async function initPwa(options = {}) {
  role = options.role || "client";
  targetProvider = options.target || (() => null);
  sessionProvider = options.session || (() => "");
  navigator.serviceWorker?.addEventListener("message", async (event) => {
    if (event.data?.type === "TOC_PUSH_RECEIVED") {
      if (event.data.scope === role) {
        status("Notificación mostrada en este dispositivo.");
        window.dispatchEvent(new CustomEvent("toc:service-update"));
      }
      return;
    }
    if (event.data?.type !== "TOC_SERVICE_ALERT") return;
    const n = event.data.notification;
    if (n?.scope !== role || document.visibilityState === "hidden") {
      event.ports[0]?.postMessage({ audible: false });
      return;
    }
    window.dispatchEvent(new CustomEvent("toc:service-update", { detail: n }));
    const audible = await sound.alert(
      n.alertKey || n.id,
      n.title + ". " + n.body,
    );
    event.ports[0]?.postMessage({ audible });
  });
  if (!demo) {
    document.addEventListener("click", activateOnInteraction, {
      capture: true,
    });
    document.addEventListener("keydown", activateOnInteraction, {
      capture: true,
    });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    document
      .querySelectorAll("[data-install-app]")
      .forEach((n) => (n.hidden = demo || installed()));
  });
  window.addEventListener("appinstalled", () =>
    document
      .querySelectorAll("[data-install-app]")
      .forEach((n) => (n.hidden = true)),
  );
  document.querySelectorAll("[data-install-app]").forEach((n) => {
    n.hidden = demo || installed();
    n.addEventListener("click", async () => {
      if (installPrompt) {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
      } else
        notify(
          ios()
            ? "En iPhone: Compartir → Añadir a pantalla de inicio."
            : "Abre el menú de tu navegador y elige Instalar aplicación o Añadir a pantalla de inicio.",
        );
    });
  });
  document
    .querySelectorAll("[data-enable-push]")
    .forEach((n) => n.addEventListener("click", enablePush));
  document
    .querySelectorAll("[data-test-push]")
    .forEach((n) => n.addEventListener("click", testPush));
  document
    .querySelectorAll("[data-check-push]")
    .forEach((n) => n.addEventListener("click", checkPush));
  const connection = () =>
    document.querySelectorAll("[data-offline-status]").forEach((n) => {
      n.hidden = navigator.onLine;
      n.textContent =
        "Estás sin conexión. Vuelve a conectarte para enviar o actualizar un servicio.";
    });
  window.addEventListener("online", connection);
  window.addEventListener("offline", connection);
  connection();
  if (demo) {
    status(
      "Demostración: los avisos fuera de la página se activan en la aplicación real.",
    );
    return;
  }
  if (!("serviceWorker" in navigator) || !isSecureContext) {
    status(
      "Puedes usar la página. La instalación y los avisos requieren un navegador compatible.",
    );
    return;
  }
  try {
    registration = await navigator.serviceWorker.register(
      new URL("sw.js", ROOT),
      { scope: ROOT, updateViaCache: "none" },
    );
    await store.put(ROOT, "config", { apiUrl: config.apiUrl, base: ROOT });
    const offer = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        const b = document.querySelector("[data-update-app]");
        if (b) {
          b.hidden = false;
          b.onclick = () => {
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => location.reload(),
              { once: true },
            );
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          };
        }
      }
    };
    offer();
    registration.addEventListener("updatefound", () =>
      registration.installing?.addEventListener("statechange", offer),
    );
    status(
      supported()
        ? Notification.permission === "granted"
          ? "Comprueba que los avisos estén activados en este dispositivo."
          : "Activa avisos para recibir novedades aunque salgas de la página."
        : "Este navegador permite instalar la app; sus avisos pueden requerir otro navegador.",
    );
    await syncPush();
  } catch {
    status(
      "No pudimos preparar la instalación en este navegador. Puedes seguir usando la página.",
    );
  }
}
