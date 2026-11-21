// Configuración pública. Nunca pongas contraseñas, tokens de sesión ni secretos aquí.
window.TOC_CONFIG = Object.freeze({
  apiUrl: "", // URL /exec del despliegue público de Apps Script.
  mapsApiKey: "", // Clave de navegador restringida a los dominios de esta web.
  city: {
    id: "barrancabermeja",
    name: "Barrancabermeja",
    lat: 7.0653,
    lng: -73.8547,
    radiusKm: 12,
    bounds: { north: 7.16, south: 6.97, east: -73.75, west: -73.96 },
  },
  pollMs: 5000,
  adminPollMs: 4000,
});
