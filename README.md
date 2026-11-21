# TocToc · Domicilios

Landing instalable para clientes, panel operativo privado y backend de Google Sheets. HTML, CSS y JavaScript nativos; el navegador no necesita frameworks ni compilación. La ilustración usa una moto negra, casco con visor y estilo juvenil, sin caja y con fondo transparente.

- `index.html`: inicio con logo, moto y botón circular de activación inspirado en Ben 10. Al pulsarlo pide GPS y abre la confirmación con dirección y mapa de Google; conserva alternativas manuales, seguimiento, animaciones y voz.
- `admin.html`: servicios, asignación de domiciliario y tarifa, mapa desplegable, Street View, búsqueda de direcciones, historial, estadísticas, administradores y contraseñas.
- `Code.gs`: backend completo, creación de hojas, sesiones, permisos, validaciones, control de concurrencia, caché, auditoría y mantenimiento diario.
- `config.js`: URL pública de Apps Script y ciudad operativa. No contiene secretos ni necesita una clave de Google Maps.

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

En 1.3.1 la marca se muestra como **TocToc**. Cuando el servicio de avisos está preparado, el primer clic o uso válido del teclado inicia la solicitud de permiso de notificaciones. El visitante debe aceptarla en el navegador; hover, desplazamiento y eventos sintéticos no conceden permisos. Se intenta automáticamente una vez por pestaña/sesión; cerrar o rechazar el aviso no causa nuevas solicitudes automáticas. El botón de activación sigue disponible. Si el permiso ya está concedido, se recupera la suscripción automáticamente. La ubicación se pide al solicitar o mejorar el punto, separada de los avisos.

La prueba PWA comprueba explícitamente que un evento Push de Chromium despierte el worker detenido y muestre la notificación del equipo y la aceptación del cliente sin ventanas de la app abiertas. Es una prueba del despertar del worker, no de la hibernación física del equipo ni de entrega real del proveedor. Las restricciones del sistema, permisos, conectividad y requisitos de iPhone/iPad siguen aplicando.

La versión 1.3 incluye instalación independiente para cliente y equipo, iconos adaptables, inicio sin conexión y avisos Web Push. Para activarlos hay que actualizar **Code.gs y appsscript.json**, ejecutar `setup()` y actualizar la implementación existente; después el jefe pulsa **Activar avisos** y cada dispositivo concede permiso. El código completo de `Code.gs` ya contiene la firma necesaria; no requiere copiar módulos adicionales ni abrir otra cuenta. Ver [instalación y avisos](INSTALACION.md#avisos-fuera-de-la-página-y-aplicación-instalada).

El cliente envía una solicitud y conserva un identificador y un token de seguimiento aleatorio. El administrador la acepta asignando nombre, celular y tarifa. El servidor verifica permisos, ciudad, estado y versión bajo un bloqueo antes de guardar. El siguiente sondeo del cliente muestra la nueva animación e intenta reproducir sonido y voz.

El cliente pulsa el botón circular, autoriza el GPS y confirma el lugar en un mapa HTML de Google dentro de la página. El servicio `Maps.newGeocoder()` de Apps Script obtiene la dirección a partir del GPS; el punto enviado sigue siendo el original del dispositivo, aunque la dirección de Google corresponda a una calle cercana. El cliente y el administrador reciben las mismas coordenadas, dirección, precisión y fecha de ubicación. Un margen GPS de 124 metros no equivale a una puerta exacta: se muestra el margen y se permite mejorar la posición, buscar otra dirección o añadir una referencia. Explorar el mapa incrustado no cambia el punto compartido. No se carga el SDK de Maps en el inicio ni se exige clave de navegador.

El nombre y celular se piden en la confirmación y pueden recordarse para futuros servicios únicamente si el cliente marca esa opción. Tipo de servicio, referencia e instrucciones permanecen disponibles en un bloque opcional. En el panel, la búsqueda de direcciones también consulta Google desde Apps Script e incluye siempre la ciudad operativa. Mapa, satélite y vista del lugar permanecen incrustados en ambos lados.

Los jefes crean administradores de su ciudad, desactivan accesos y restablecen contraseñas. Los administradores deben cambiar su contraseña inicial antes de operar. No existe una contraseña predeterminada en el repositorio. Las cuentas de jefe adicionales se gestionan por el propietario del Sheet, no desde una ruta pública.

Al abrir admin.html sin sesión, el sistema verifica el estado de instalación. Si Users está vacía, exige crear al primer jefe y muestra directamente el formulario con código privado y confirmación de contraseña. Cuando ya hay una cuenta, presenta el ingreso normal. El estado público no expone datos de usuarios. Si el backend desplegado es anterior a la versión 1.1.0, la interfaz explica cómo actualizarlo en lugar de interpretar una falta de autenticación como si fuera una cuenta existente.

## Rendimiento y límites

La respuesta visual al clic es local. La confirmación del servidor depende de Google. Panel: sondeo cada 4 segundos; cliente: cada 5 segundos, más latencia. No hay WebSockets ni garantía de entrega instantánea. Al ocultar la pestaña se reduce el sondeo a 30 segundos; los errores aplican espera creciente. Al regresar, se consulta de nuevo. Las respuestas sin cambios evitan releer solicitudes; los mapas se cargan al desplegarlos.

La geocodificación utiliza las cuotas del servicio Maps de Apps Script, con caché de 30 minutos, límites de frecuencia y un presupuesto preventivo de 900 consultas nuevas al día por proyecto. El propietario puede ajustar `MAPS_DAILY_LIMIT` en Script Properties según la cuota real de su cuenta; no cambia los límites que aplica Google. Si Google o su cuota fallan, el punto GPS y la entrada manual siguen disponibles. El HTML incrustado no necesita clave; no equivale a integrar todas las funciones de Places Autocomplete o de Maps JavaScript.

El panel normaliza teléfonos numéricos que pueda devolver Sheets y construye las tarjetas antes de sustituir la lista. Solo confirma la revisión recibida después de renderizar; una respuesta sin cambios puede reconstruir una lista que haya quedado vacía. Un error de detalle conserva una tarjeta resumida y la acción de aceptación.

Sheets/Apps Script tiene cuotas y límites de concurrencia. Es apropiado para una operación local de volumen moderado, no para prometer latencia de milisegundos ni escala ilimitada. Hay un límite de 10.000 solicitudes en la hoja operativa y límites de frecuencia orientativos en caché. La caché puede ser desalojada por Google; no equivale a protección perimetral contra ataques. Para una operación pública de alto tráfico hará falta un backend con controles de red y un transporte de eventos.

El mantenimiento diario conserva los datos del negocio: mueve servicios cerrados con más de 30 días de Requests a Archive, verifica la copia completa antes de retirar el original de la hoja operativa y mantiene todo el historial sin eliminación automática por antigüedad. Conserva usuarios, auditoría y estadísticas; elimina sesiones de acceso vencidas, renueva caché temporal y retira únicamente metadatos técnicos de notificaciones ya terminadas de más de siete días y permisos de avisos vencidos hace más de siete días. Reconcilia las estadísticas recientes sin eliminar agregados históricos. Los pendientes de más de una hora se cancelan con un motivo registrado y se conservan. La comprobación al iniciar sesión agenda el mantenimiento en segundo plano si falta y omite trabajo cuando ya se ejecutó ese día. No edites filas manualmente durante la operación; los IDs, versiones y contadores los administra el backend.

## Datos y seguridad

Sheet privado; permisos comprobados en servidor; sesiones de ocho horas; tokens almacenados como SHA-256; contraseñas derivadas con PBKDF2-SHA-256 de 310.000 iteraciones en el navegador y verificadores HMAC con secreto de Script Properties; bloqueo de mutaciones; escape de fórmulas y representación del texto mediante DOM sin HTML procedente del usuario. El token del administrador se conserva en `sessionStorage`, el de seguimiento en `localStorage`. Las llamadas usan HTTPS, POST y tokens explícitos, sin cookies de autenticación. El derivado enviado en el login es una credencial: no lo registres ni compartas. No borres ni cambies `PEPPER`, porque invalidaría las contraseñas existentes.

Sheets no ofrece transacciones entre varias hojas. Una interrupción excepcional entre escrituras puede dejar contadores pendientes; la reconciliación diaria los reconstruye a partir de solicitudes conservadas. Las auditorías no contienen contraseñas ni tokens. Los editores del Sheet y del proyecto Apps Script tienen acceso administrativo a los datos: no concedas esos permisos a operadores que solo necesitan el panel.

El GPS comparte la última posición del cliente mientras la página permanece abierta y el permiso está activo. No se rastrea al domiciliario ni se dibuja una ruta real de su moto: las animaciones expresan estados del servicio. La zona inicial es un radio operativo configurable de 12 km alrededor del centro indicado; no representa el límite oficial del municipio. Verifica la cobertura comercial antes de abrir al público.

## Validación

`npm test` incluye firmas VAPID verificadas con la criptografía nativa de Node, permisos, claves inconsistentes, destinos permitidos, privacidad, sesión vencida, reintentos, destinatario caducado, recuperación de una aceptación anterior a la suscripción y conservación de datos. `npm run test:pwa` inicia su propio servidor de prueba y ejecuta el backend completo en memoria; genera las claves con WebCrypto, guarda permisos en IndexedDB y comprueba `showNotification` con todas las ventanas de la aplicación cerradas, mediante entrada Push simulada por Chromium. También verifica cuatro tamaños de pantalla, indicadores neutros e inicio sin conexión. El proveedor de suscripciones está simulado; **no acredita entrega real desde Google a Android, Windows o iOS**. Esa verificación requiere publicar Apps Script y un dispositivo con permiso. Ninguna prueba escribe en el Sheet real.

Para reconstruir la firma incluida en `Code.gs`: `npm ci` y `npm run build:push`. La fuente es `backend/push-crypto.source.mjs` y `backend/push-service.gs`; la versión completa generada ya está lista para copiar. Las dependencias de desarrollo `@noble/curves` y `@noble/hashes` conservan sus licencias MIT en `vendor/` y en el archivo generado. No se envían al navegador. Al cambiar el código público, actualizar también la versión de las importaciones y el precache de `sw.js`; las actualizaciones del worker esperan una acción del usuario para no interrumpir formularios.

Las pruebas ejecutan el `Code.gs` real sobre un adaptador en memoria de los servicios de Apps Script. Cubren idempotencia, privacidad, estados, permisos, cambio inicial, revocación, aislamiento por ciudad, GPS, mantenimiento y estadísticas. Esto no sustituye la prueba del despliegue real de Google, CORS, cuotas, GPS físico ni audio en teléfonos. El flujo demo permite revisar la interfaz y la sincronización entre pestañas.

La prueba del navegador está en `tests/browser.mjs`. Con el servidor local en ejecución, instala Playwright como herramienta de desarrollo (`npm install --no-save playwright` y `npx playwright install chromium`) y ejecuta `npm run test:browser`. Guarda capturas y un informe en `test-results/`, excluido del repositorio. Se pueden usar instalaciones existentes mediante `TOC_PLAYWRIGHT_MODULE` (ruta de módulo ESM) y `TOC_BROWSER_EXECUTABLE` (ejecutable Chromium). Verifica cliente/admin en dos pestañas, aceptación, recuperación, finalización, estadísticas, equipo, GPS simulado y ausencia de errores del navegador. También prueba el flujo de producción contra el `Code.gs` real ejecutado sobre el adaptador en memoria: login con contraseña derivada, solicitud, aceptación, creación de un administrador, cambio inicial obligatorio y permisos. No envía datos al Sheet real. El audio se comprueba a nivel de AudioContext y ejecución; la audición real y la voz del dispositivo se validan en el teléfono.

Las pruebas funcionales sustituyen el contenido de los iframes externos para aislar fallos de red y scripts ajenos. `npm run test:maps-live` comprueba por separado la carga de Google Maps y Street View reales dentro del cliente, sin clave y usando un punto de ejemplo de Barrancabermeja. El adaptador de Maps del backend es de prueba: la geocodificación real de Apps Script se comprueba después de actualizar su implementación a 1.2.0 o posterior.

## Referencias de implementación

- [Aplicaciones web de Apps Script](https://developers.google.com/apps-script/guides/web)
- [Cuotas de Apps Script](https://developers.google.com/apps-script/guides/services/quotas)
- [Geocoder integrado de Apps Script](https://developers.google.com/apps-script/reference/maps/geocoder)
- [Compartir e incrustar un mapa de Google](https://support.google.com/maps/answer/144361)

La ilustración se generó y se recortó con la herramienta integrada imagegen; los prompts están en [assets/ARTWORK.md](assets/ARTWORK.md). El recurso visible es `assets/courier-cutout.webp` (850 × 850, aproximadamente 189 KB, canal alfa real). Se conserva el original como referencia. El símbolo `assets/mark.svg` es un monograma ligero de la interfaz, independiente de la ilustración.
