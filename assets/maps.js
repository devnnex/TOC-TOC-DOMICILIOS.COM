import { api, el, icon } from "./core.js?v=1.2.0";

export function mapUrl(order, city, mode = "satellite") {
  const hasPoint =
    order.lat !== "" &&
    order.lat != null &&
    order.lng !== "" &&
    order.lng != null &&
    Number.isFinite(Number(order.lat)) &&
    Number.isFinite(Number(order.lng));
  const q = hasPoint
    ? `${Number(order.lat)},${Number(order.lng)}`
    : `${order.address || ""}, ${city.name}, Colombia`;
  if (mode === "street" && hasPoint) {
    const url = new URL("https://www.google.com/maps");
    Object.entries({
      layer: "c",
      cbll: q,
      cbp: "12,0,0,0,0",
      output: "svembed",
      hl: "es",
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.href;
  }
  const url = new URL("https://maps.google.com/maps");
  Object.entries({
    q,
    hl: "es",
    z: "19",
    t: mode === "satellite" ? "k" : "m",
    output: "embed",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.href;
}

// Mapa HTML de Google: no carga un SDK ni exige una clave de navegador.
export function mapPreview(order, city, options = {}) {
  const root = el("div", "map-preview"),
    toolbar = el("div", "map-toolbar"),
    frame = el("iframe");
  frame.title = `Punto de recogida en ${city.name}`;
  frame.loading = options.eager ? "eager" : "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allowFullscreen = true;
  frame.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms",
  );
  let mode = options.mode || "satellite";
  const buttons = [];
  const change = (next) => {
    mode = next;
    frame.src = mapUrl(order, city, mode);
    buttons.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode)),
    );
  };
  for (const [value, label] of [
    ["map", "Mapa"],
    ["satellite", "Satélite"],
    ["street", "Ver lugar"],
  ]) {
    if (value === "street" && (order.lat == null || order.lat === "")) continue;
    const button = el("button", "map-mode", label);
    button.type = "button";
    button.dataset.mode = value;
    button.addEventListener("click", () => change(value));
    buttons.push(button);
    toolbar.append(button);
  }
  const marker = el("span", "map-provider", "Google Maps");
  toolbar.append(marker);
  root.append(
    toolbar,
    frame,
    el(
      "p",
      "map-caption",
      "Explora el lugar aquí. Las imágenes y Street View dependen de la cobertura de Google; mover la vista no cambia el punto compartido.",
    ),
  );
  change(mode);
  return root;
}

export async function reverseAddress(point, city) {
  return api("resolveLocation", {
    cityId: city.id,
    lat: point.lat,
    lng: point.lng,
  });
}
export async function searchAddresses(address, city) {
  const result = await api("searchAddress", { cityId: city.id, address });
  if (!Array.isArray(result.results) || !result.results.length)
    throw new Error(
      `No encontramos esa dirección en ${city.name}. Añade calle, número y barrio.`,
    );
  return result.results;
}

// Búsqueda Google desde Apps Script: resultados locales, sin abrir otra plataforma.
export function autocomplete(host, city, onSelect, initialValue = "") {
  if (!host) return;
  const label = el("label", "", "Buscar otra dirección en la ciudad"),
    row = el("div", "embedded-search"),
    input = el("input"),
    button = el("button", "button button-secondary", "Buscar"),
    status = el("p", "field-help"),
    results = el("div", "address-results");
  input.type = "search";
  input.placeholder = `Calle, número o lugar en ${city.name}`;
  input.value = initialValue;
  input.maxLength = 220;
  input.setAttribute("aria-label", `Buscar dirección en ${city.name}`);
  button.type = "button";
  row.append(input, button);
  label.append(row);
  host.replaceChildren(label, status, results);
  const search = async () => {
    if (input.value.trim().length < 4) {
      status.textContent = "Escribe una calle, número y barrio.";
      return;
    }
    button.disabled = true;
    status.textContent = "Buscando direcciones de la ciudad…";
    results.replaceChildren();
    try {
      const found = await searchAddresses(input.value.trim(), city);
      status.textContent =
        "Selecciona el resultado que coincide con tu dirección.";
      for (const p of found) {
        const choice = el("button", "address-result");
        choice.type = "button";
        choice.append(icon("pin"), el("span", "", p.address));
        choice.addEventListener("click", () => onSelect(p));
        results.append(choice);
      }
    } catch (e) {
      status.textContent = ["UNAUTHORIZED", "UNKNOWN_ACTION"].includes(e.code)
        ? "Actualiza Code.gs a la versión 1.2.0 para habilitar la búsqueda integrada."
        : e.message;
    } finally {
      button.disabled = false;
    }
  };
  button.addEventListener("click", search);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      search();
    }
  });
}
