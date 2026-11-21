# TOC TOC · Domicilios

Landing para clientes, panel operativo privado y backend de Google Sheets. HTML, CSS y JavaScript nativos; sin frameworks, paquetes de ejecución ni proceso de compilación. La ilustración usa una moto negra, casco con visor y estilo juvenil, sin caja.

- `index.html`: solicitar, GPS opcional, dirección manual, seguimiento, cancelación antes de aceptar, animaciones y avisos de voz.
- `admin.html`: servicios, asignación de domiciliario y tarifa, mapa desplegable, Street View, búsqueda de direcciones, historial, estadísticas, administradores y contraseñas.
- `Code.gs`: backend completo, creación de hojas, sesiones, permisos, validaciones, control de concurrencia, caché, auditoría y mantenimiento diario.
- `config.js`: URL pública de Apps Script y clave de Google Maps restringida al sitio. No contiene secretos.

**La aplicación está entregada como código; producción requiere ejecutar y desplegar Apps Script y configurar su URL.** Una página sin backend configurado muestra ese estado y ofrece una demostración explícita. Nunca simula haber enviado un servicio real.

## Empezar

Lee [INSTALACION.md](INSTALACION.md). Ejecuta `setup()` sobre el Sheet `1RY7f8Xuel5-tK9e_PQhXgscinU8AQN45pge5p-f16u8` y sigue el alta del primer jefe.

Con Node 22 o posterior, sin instalar paquetes:

```sh
npm run dev
npm run check
npm test
```

Abre `http://127.0.0.1:4173/index.html?demo=1` y `http://127.0.0.1:4173/admin.html?demo=1` en el mismo navegador. El modo demo comparte datos entre pestañas mediante almacenamiento local y jamás llama a Sheets. Los datos de ejemplo están identificados. En producción, clientes y operadores pueden usar dispositivos distintos porque el estado reside en Sheets.

## Operación

El cliente envía una solicitud y conserva un identificador y un token de seguimiento aleatorio. El administrador la acepta asignando nombre, celular y tarifa. El servidor verifica permisos, ciudad, estado y versión bajo un bloqueo antes de guardar. El siguiente sondeo del cliente muestra la nueva animación e intenta reproducir sonido y voz.

Los jefes crean administradores de su ciudad, desactivan accesos y restablecen contraseñas. Los administradores deben cambiar su contraseña inicial antes de operar. No existe una contraseña predeterminada en el repositorio. Las cuentas de jefe adicionales se gestionan por el propietario del Sheet, no desde una ruta pública.

## Rendimiento y límites

La respuesta visual al clic es local. La confirmación del servidor depende de Google. Panel: sondeo cada 4 segundos; cliente: cada 5 segundos, más latencia. No hay WebSockets ni garantía de entrega instantánea. Al ocultar la pestaña se reduce el sondeo a 30 segundos; los errores aplican espera creciente. Al regresar, se consulta de nuevo. Las respuestas sin cambios evitan releer solicitudes; los mapas se cargan al desplegarlos.

Sheets/Apps Script tiene cuotas y límites de concurrencia. Es apropiado para una operación local de volumen moderado, no para prometer latencia de milisegundos ni escala ilimitada. Hay un límite de 10.000 solicitudes en la hoja operativa y límites de frecuencia orientativos en caché. La caché puede ser desalojada por Google; no equivale a protección perimetral contra ataques. Para una operación pública de alto tráfico hará falta un backend con controles de red y un transporte de eventos.

El mantenimiento diario archiva servicios cerrados con más de 30 días, purga datos de solicitudes con más de 90 días y sesiones vencidas, y reconcilia estadísticas agregadas. Los pendientes de más de una hora se cancelan durante ese ciclo. La comprobación al iniciar sesión omite trabajo cuando ya se ejecutó ese día. No se borra ni ordena toda la hoja en cada login. No edites filas manualmente durante la operación; los IDs, versiones y contadores los administra el backend.

## Datos y seguridad

Sheet privado; permisos comprobados en servidor; sesiones de ocho horas; tokens almacenados como SHA-256; contraseñas derivadas con PBKDF2-SHA-256 de 310.000 iteraciones en el navegador y verificadores HMAC con secreto de Script Properties; bloqueo de mutaciones; escape de fórmulas y representación del texto mediante DOM sin HTML procedente del usuario. El token del administrador se conserva en `sessionStorage`, el de seguimiento en `localStorage`. Las llamadas usan HTTPS, POST y tokens explícitos, sin cookies de autenticación. El derivado enviado en el login es una credencial: no lo registres ni compartas. No borres ni cambies `PEPPER`, porque invalidaría las contraseñas existentes.

Sheets no ofrece transacciones entre varias hojas. Una interrupción excepcional entre escrituras puede dejar contadores pendientes; la reconciliación diaria los reconstruye a partir de solicitudes conservadas. Las auditorías no contienen contraseñas ni tokens. Los editores del Sheet y del proyecto Apps Script tienen acceso administrativo a los datos: no concedas esos permisos a operadores que solo necesitan el panel.

El GPS comparte la última posición del cliente mientras la página permanece abierta y el permiso está activo. No se rastrea al domiciliario ni se dibuja una ruta real de su moto: las animaciones expresan estados del servicio. La zona inicial es un radio operativo configurable de 12 km alrededor del centro indicado; no representa el límite oficial del municipio. Verifica la cobertura comercial antes de abrir al público.

## Validación

Las pruebas ejecutan el `Code.gs` real sobre un adaptador en memoria de los servicios de Apps Script. Cubren idempotencia, privacidad, estados, permisos, cambio inicial, revocación, aislamiento por ciudad, GPS, mantenimiento y estadísticas. Esto no sustituye la prueba del despliegue real de Google, CORS, cuotas, GPS físico ni audio en teléfonos. El flujo demo permite revisar la interfaz y la sincronización entre pestañas.

La prueba del navegador está en `tests/browser.mjs`. Con el servidor local en ejecución, instala Playwright como herramienta de desarrollo (`npm install --no-save playwright` y `npx playwright install chromium`) y ejecuta `npm run test:browser`. Guarda capturas y un informe en `test-results/`, excluido del repositorio. Se pueden usar instalaciones existentes mediante `TOC_PLAYWRIGHT_MODULE` (ruta de módulo ESM) y `TOC_BROWSER_EXECUTABLE` (ejecutable Chromium). Verifica cliente/admin en dos pestañas, aceptación, recuperación, finalización, estadísticas, equipo, GPS simulado y ausencia de errores del navegador. También prueba el flujo de producción contra el `Code.gs` real ejecutado sobre el adaptador en memoria: login con contraseña derivada, solicitud, aceptación, creación de un administrador, cambio inicial obligatorio y permisos. No envía datos al Sheet real. El audio se comprueba a nivel de AudioContext y ejecución; la audición real y la voz del dispositivo se validan en el teléfono.

## Referencias de implementación

- [Aplicaciones web de Apps Script](https://developers.google.com/apps-script/guides/web)
- [Cuotas de Apps Script](https://developers.google.com/apps-script/guides/services/quotas)
- [Autocomplete de Places](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new)
- [Mapas incrustados y Street View](https://developers.google.com/maps/documentation/embed/embedding-map)

La ilustración se generó con la herramienta integrada imagegen; el prompt está en [assets/ARTWORK.md](assets/ARTWORK.md). El recurso final es `assets/courier.webp` (850 × 850, aproximadamente 78 KB). El símbolo `assets/mark.svg` es un monograma ligero de la interfaz, independiente de la ilustración.
