import { config, el, icon, notify } from "./core.js";
let ready;
export function loadMaps() {
  if (!config.mapsApiKey)
    return Promise.reject(
      new Error(
        "Configura una clave de Google Maps para activar la búsqueda de direcciones.",
      ),
    );
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  ready ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const callback = "tocMapsReady";
    window[callback] = resolve;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.mapsApiKey)}&loading=async&libraries=places&language=es&region=CO&v=weekly&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      ready = null;
      reject(
        new Error("Google Maps no pudo cargar. Puedes escribir la dirección."),
      );
    };
    document.head.append(script);
    setTimeout(
      () =>
        reject(
          new Error(
            "Google Maps está tardando. Escribe la dirección manualmente.",
          ),
        ),
      15000,
    );
  });
  return ready;
}
export async function autocomplete(host, city, onSelect) {
  if (!config.mapsApiKey || !host) return;
  try {
    await loadMaps();
    const { PlaceAutocompleteElement } =
      await google.maps.importLibrary("places");
    const input = new PlaceAutocompleteElement({
      includedRegionCodes: ["co"],
      locationRestriction: city.bounds,
    });
    input.placeholder = `Buscar con Google en ${city.name}`;
    input.setAttribute("aria-label", `Buscar dirección en ${city.name}`);
    input.addEventListener("gmp-select", async ({ placePrediction }) => {
      try {
        const p = placePrediction.toPlace();
        await p.fetchFields({
          fields: ["formattedAddress", "location", "addressComponents"],
        });
        const locality =
          p.addressComponents
            ?.filter(
              (x) =>
                x.types.includes("locality") ||
                x.types.includes("administrative_area_level_2"),
            )
            .map((x) => x.longText)
            .join(" ") || "";
        if (
          locality &&
          !locality.toLocaleLowerCase().includes(city.name.toLocaleLowerCase())
        )
          throw new Error(
            "Selecciona una dirección dentro de la ciudad del servicio.",
          );
        onSelect({
          address: p.formattedAddress,
          lat: p.location.lat(),
          lng: p.location.lng(),
        });
      } catch (e) {
        notify(e.message);
      }
    });
    input.addEventListener("gmp-error", () =>
      notify("La búsqueda de Google no está disponible. Escribe la dirección."),
    );
    host.replaceChildren(input);
  } catch (e) {
    host.append(el("p", "field-help", e.message));
  }
}
export function mapPreview(order, city) {
  const root = el("div", "map-preview");
  const toolbar = el("div", "map-toolbar");
  const q =
    order.lat !== "" && order.lat != null
      ? `${order.lat},${order.lng}`
      : `${order.address}, ${city.name}, Colombia`;
  const link = el("a", "text-button", "Abrir Google Maps");
  link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  toolbar.append(icon("pin"), link);
  root.append(toolbar);
  if (!config.mapsApiKey) {
    root.append(
      el(
        "p",
        "map-placeholder",
        "Vista interactiva disponible al configurar Google Maps. Puedes consultar esta dirección con el enlace superior.",
      ),
    );
    return root;
  }
  const frame = el("iframe");
  frame.title = `Ubicación de recogida en ${city.name}`;
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allowFullscreen = true;
  const mapUrl = () =>
    `https://www.google.com/maps/embed/v1/${order.lat !== "" && order.lat != null ? "place" : "search"}?key=${encodeURIComponent(config.mapsApiKey)}&q=${encodeURIComponent(q)}&zoom=18&language=es`;
  frame.src = mapUrl();
  root.append(frame);
  if (order.lat !== "" && order.lat != null) {
    const toggle = el("button", "text-button", "Ver las casas · Street View");
    toggle.type = "button";
    let street = false;
    toggle.addEventListener("click", () => {
      street = !street;
      frame.src = street
        ? `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(config.mapsApiKey)}&location=${encodeURIComponent(q)}&heading=0&pitch=0&fov=85`
        : mapUrl();
      toggle.textContent = street
        ? "Volver al mapa"
        : "Ver las casas · Street View";
    });
    toolbar.append(toggle);
    root.append(
      el(
        "p",
        "micro",
        "Street View depende de la cobertura de Google; sus imágenes pueden no ser recientes.",
      ),
    );
  }
  return root;
}
