export const config = window.TOC_CONFIG;
export const demo = new URLSearchParams(location.search).get("demo") === "1";
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const icon = (name) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.classList.add("icon");
  s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS(s.namespaceURI, "use");
  u.setAttribute("href", `assets/icons.svg#${name}`);
  s.append(u);
  return s;
};
export function el(tag, cls, content) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (content !== undefined) n.textContent = String(content);
  return n;
}
export function notify(message) {
  const n = $("#toast");
  if (!n) return;
  const parent = $("dialog[open]") || document.body;
  if (n.parentNode !== parent) parent.append(n);
  n.textContent = message;
  n.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (n.hidden = true), 5500);
}
export const money = (v) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);
export const date = (v, options = {}) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    ...options,
  }).format(new Date(v));
export const time = (v) =>
  date(v, {
    day: undefined,
    month: undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
export const statusLabels = {
  pending: "Por aceptar",
  accepted: "En camino",
  completed: "Completado",
  cancelled: "Cancelado",
};
export const serviceLabels = {
  envio: "Envío",
  compra: "Compra",
  diligencia: "Diligencia",
};
export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export function storageGet(key, fallback = null, store = localStorage) {
  try {
    return JSON.parse(store.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function storageSet(key, value, store = localStorage) {
  try {
    if (value == null) store.removeItem(key);
    else store.setItem(key, JSON.stringify(value));
  } catch {
    notify(
      "Tu navegador no permite guardar el seguimiento. Mantén esta pestaña abierta.",
    );
  }
}
export async function passwordKey(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 310000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
let demoModule;
export async function api(action, data = {}, session = "") {
  if (demo) {
    demoModule ||= import("./demo.js");
    return (await demoModule).request(action, data, session);
  }
  if (!config.apiUrl)
    throw Object.assign(
      new Error(
        "Falta conectar Apps Script. Consulta INSTALACION.md o abre la demostración.",
      ),
      { code: "NOT_CONFIGURED" },
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch(config.apiUrl, {
      method: "POST",
      credentials: "omit",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, data, session }),
      signal: controller.signal,
    });
    if (!r.ok)
      throw new Error(
        "El servidor no respondió correctamente. Vuelve a intentar.",
      );
    let result;
    try {
      result = await r.json();
    } catch {
      throw new Error(
        "El despliegue de Apps Script no devolvió JSON. Revisa el acceso público y la URL /exec.",
      );
    }
    if (!result.ok)
      throw Object.assign(
        new Error(
          result.error?.message || "No se pudo completar la operación.",
        ),
        { code: result.error?.code },
      );
    return result.data;
  } catch (e) {
    if (e.name === "AbortError")
      throw new Error(
        "Google está tardando en responder. Conservamos tu solicitud para reintentar sin duplicarla.",
      );
    if (e instanceof TypeError)
      throw new Error(
        "No pudimos conectar. Revisa tu conexión y el despliegue público de Apps Script.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export function banner() {
  const n = $("#environment-banner");
  if (!n) return;
  if (demo) {
    n.hidden = false;
    n.textContent =
      "DEMOSTRACIÓN LOCAL · Datos de ejemplo en este navegador. No se envían servicios reales.";
  } else if (!config.apiUrl) {
    n.hidden = false;
    n.append(document.createTextNode("Conexión pendiente con Google Sheets. "));
    const a = el("a", "", "Explorar demostración");
    a.href = `${location.pathname.split("/").pop() || "index.html"}?demo=1`;
    n.append(a);
  }
  $$("[data-city]").forEach((x) => (x.textContent = config.city.name));
  $$("[data-admin-link]").forEach(
    (x) => (x.href = `admin.html${demo ? "?demo=1" : ""}`),
  );
  if ($("#year")) $("#year").textContent = new Date().getFullYear();
}
export function busy(button, state, text = "Procesando…") {
  if (state) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.classList.add("is-busy");
    button.textContent = text;
  } else {
    button.disabled = false;
    button.classList.remove("is-busy");
    button.textContent = button.dataset.label || "Continuar";
  }
}
export function poll(fn, interval = 5000) {
  let stopped = false,
    timer,
    running = false,
    failures = 0;
  const run = async () => {
    if (stopped || running) return;
    clearTimeout(timer);
    running = true;
    try {
      await fn();
      failures = 0;
    } catch {
      failures = Math.min(failures + 1, 4);
    } finally {
      running = false;
      if (!stopped)
        timer = setTimeout(
          run,
          document.hidden ? 30000 : Math.min(interval * 2 ** failures, 30000),
        );
    }
  };
  const wake = () => {
    if (!document.hidden) run();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  run();
  return {
    refresh: run,
    stop() {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    },
  };
}
export const sound = {
  context: null,
  enabled: false,
  async enable() {
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();
      this.enabled = this.context.state === "running";
      if ("speechSynthesis" in window) {
        const silent = new SpeechSynthesisUtterance("");
        silent.volume = 0;
        speechSynthesis.speak(silent);
      }
      return this.enabled;
    } catch {
      return false;
    }
  },
  play(message, speak = true) {
    if (!this.enabled) return;
    try {
      [659.25, 830.61, 987.77].forEach((freq, i) => {
        const osc = this.context.createOscillator(),
          gain = this.context.createGain(),
          start = this.context.currentTime + i * 0.15;
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
        osc.connect(gain);
        gain.connect(this.context.destination);
        osc.start(start);
        osc.stop(start + 0.45);
      });
    } catch {
      /* La pestaña puede haber sido suspendida. */
    }
    if (speak && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(message);
      u.lang = "es-CO";
      u.rate = 1;
      const voices = speechSynthesis.getVoices();
      u.voice =
        voices.find((v) => v.lang === "es-CO") ||
        voices.find((v) => v.lang.startsWith("es")) ||
        null;
      setTimeout(() => speechSynthesis.speak(u), 650);
    }
  },
};
export function distance(a, b) {
  const r = Math.PI / 180,
    dLat = (b.lat - a.lat) * r,
    dLng = (b.lng - a.lng) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function inCity(point, city = config.city) {
  return distance(point, city) <= city.radiusKm;
}
export function wireDialogs() {
  $$("[data-close-dialog]").forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog").close()),
  );
}
