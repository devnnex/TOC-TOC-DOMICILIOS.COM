// Aísla las pruebas funcionales de red y scripts de un proveedor externo.
// Las capturas de Google real se comprueban por separado con maps-live.mjs.
export async function stubMapFrames(context) {
  const respond = (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="margin:0;padding:25px;font:14px system-ui;background:#edf2e9;color:#54634b"><strong>Mapa de Google · prueba automática</strong><p>Vista externa sustituida durante esta prueba. Se verifica que la URL conserve el punto GPS.</p></body></html>',
    });
  await context.route("https://maps.google.com/**", respond);
  await context.route("https://www.google.com/maps**", respond);
}
