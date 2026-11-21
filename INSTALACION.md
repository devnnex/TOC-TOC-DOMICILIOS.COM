# Instalación de TOC TOC

## 1. Preparar Google Sheets

Abre el Sheet `1RY7f8Xuel5-tK9e_PQhXgscinU8AQN45pge5p-f16u8` con una cuenta que pueda editarlo. En **Extensiones → Apps Script**, reemplaza el contenido del archivo de código por todo [Code.gs](Code.gs). El nombre del archivo puede ser `Code` o `code`: las funciones son las mismas.

En configuración del proyecto, elige la zona horaria **America/Bogota**, habilita mostrar `appsscript.json` y pega [appsscript.json](appsscript.json). Guarda y ejecuta **`setup()`**. Autoriza los permisos de Sheets, disparadores y conexiones externas para enviar avisos. El ID del Sheet ya está incluido.

Se crearán estas hojas y columnas sin borrar otras hojas del documento:

| Hoja | Uso |
| --- | --- |
| Requests | Solicitudes y última ubicación del cliente |
| Archive | Servicios cerrados archivados tras 30 días |
| Users | Usuarios, roles y verificadores de contraseña |
| Sessions | Hashes de sesiones con vencimiento |
| DailyStats | Estadísticas diarias sin datos de clientes |
| Cities | Ciudad, centro y zona de operación |
| Audit | Registro de acciones por usuario e identificador |
| System | Versión y fechas de mantenimiento |
| PushSubscriptions | Dispositivos autorizados y permisos de avisos por cuenta o servicio |
| PushEvents | Cola técnica de entrega y reintentos de avisos |

El registro de ejecución mostrará un **código privado de instalación**. Consérvalo temporalmente: se usará para crear el primer jefe. No lo pegues en GitHub, en `config.js`, ni en un chat público. `setup()` se puede repetir; no reinicia datos. Si detecta columnas incompatibles, se detiene para evitar sobrescribir información.

Mantén el Sheet privado. Los clientes y administradores de la aplicación no necesitan acceso de Google al documento.

## 2. Publicar Apps Script

Selecciona **Implementar → Nueva implementación → Aplicación web**:

- Ejecutar como: **tú**, propietario/editor autorizado del Sheet.
- Quién tiene acceso: **Cualquier persona**. Si tu organización lo prohíbe, ese bloqueo debe resolverlo su administrador; la web estática no puede evitarlo.

Copia la URL terminada en **`/exec`**. No uses `/dev`, ni una URL de `googleusercontent` que aparezca después de una redirección. En [config.js](config.js) asigna:

```js
apiUrl: 'https://script.google.com/macros/s/TU_DESPLIEGUE/exec',
```

Visitar `/exec` mostrará un JSON de estado. El resto de las operaciones se ejecuta por POST `text/plain`, con respuestas JSON legibles. No se usa `no-cors`, porque impediría confirmar que una operación realmente terminó.

**Cada modificación de Code.gs exige actualizar la implementación a una nueva versión.** Guardar el archivo en el editor no actualiza automáticamente una implementación versionada.

## 3. Crear el primer jefe

Abre `admin.html` desde HTTPS o el servidor local. El panel comprueba automáticamente la instalación: si **Users no tiene cuentas**, muestra directamente **Primero, crea tu cuenta de jefe** y exige completar el alta antes de operar. No hay un enlace escondido que debas buscar. Escribe nombre, correo de acceso, contraseña de mínimo 12 caracteres, confirmación de la contraseña y el código privado del registro de `setup()`. El correo que elijas será tu usuario de acceso; no necesita estar conectado con Google.

Si no conservaste el código, ejecuta de nuevo `setup()`: mientras no existan usuarios, vuelve a mostrar el mismo código y no reinicia las hojas ni los datos. Si la interfaz indica que el despliegue usa una versión anterior, reemplaza Code.gs por el actual y **actualiza la implementación web a una nueva versión** conservando /exec; guardar el archivo o hacer push a GitHub no actualiza una implementación versionada de Google.

Después del alta, el mismo panel muestra automáticamente el ingreso normal. El backend impide crear un segundo jefe por la ruta inicial, incluso si dos pestañas intentan completar el alta. La comprobación pública devuelve únicamente el estado de instalación y la versión: nunca correos, contraseñas ni el código privado.

El código de instalación se elimina al crear el primer jefe. Después se ingresa con correo y contraseña. No hay cuentas ni claves de ejemplo para producción. Para recuperar un jefe sin sesión, el propietario del proyecto puede emitir temporalmente un nuevo usuario de recuperación desde Apps Script o restablecer el verificador con un procedimiento controlado; no existe una puerta pública de recuperación que evite la autenticación.

Dentro de **Mi equipo**, el jefe crea administradores. Debe comunicarles la contraseña inicial por un canal privado. Cada administrador debe cambiarla al ingresar. Desactivarlo cierra sus sesiones. Restablecer su contraseña también revoca sus sesiones anteriores.

## 4. Google Maps integrado, sin clave de navegador

La vista usa un mapa HTML de Google incrustado con las coordenadas del cliente; no necesitas crear ni introducir una clave. El mapa, el satélite y la exploración del lugar se muestran dentro de la web del cliente y del administrador. Las imágenes de Street View dependen de la cobertura de Google y pueden no ser recientes.

La dirección automática y la búsqueda manual usan `Maps.newGeocoder()` integrado en Apps Script. **Debes copiar el Code.gs de la versión 1.2.0 o posterior y actualizar la implementación** para habilitar las acciones `resolveLocation` y `searchAddress`. No cambia el esquema de las hojas ni requiere reiniciar datos. Consulta [la documentación del servicio](https://developers.google.com/apps-script/reference/maps/geocoder).

Apps Script aplica cuotas de geocodificación según la cuenta. El sistema usa caché temporal, comprueba la zona y limita nuevas consultas a 900 por día de forma preventiva. En Script Properties, `MAPS_DAILY_LIMIT` permite ajustar ese presupuesto a la cuota real de tu cuenta, sin ampliarla. El GPS y la dirección manual siguen disponibles si la búsqueda falla o Google limita consultas. Los mapas incrustados son independientes de esa cuota de geocodificación. Revisa las [cuotas oficiales](https://developers.google.com/apps-script/guides/services/quotas).

La búsqueda añade siempre la ciudad del operador, valida las coordenadas y descarta resultados de otra zona. El mapa incrustado puede explorarse y acercarse; mover su vista no modifica las coordenadas enviadas. Para corregir el punto, utiliza **Escribir o corregir dirección → Ubicar** y selecciona el resultado, o mejora el GPS. No hay acceso programático al centro de un iframe de Google: no se presenta el desplazamiento visual como si cambiara la recogida. El mapa incluye los controles y la atribución de Google. Las funciones de Places Autocomplete y de un editor completo de pines requieren una integración API diferente y no son necesarias en este flujo.

## 5. Verificar la zona de operación

La configuración inicial utiliza Barrancabermeja y un radio operativo de **12 km**, editable. Confirma ese alcance antes de abrir al público. Cambia el centro, radio y límites de la hoja **Cities** y también `city` de `config.js` para mantener interfaz y servidor alineados. La caché de ciudad dura hasta 60 segundos. No cambies IDs de ciudades que ya tengan solicitudes. El límite es comercial y aproximado; no es un polígono oficial del municipio.

Una dirección manual siempre se consulta junto con la ciudad del administrador. Sin coordenadas verificadas no se puede garantizar automáticamente que un texto corresponde a una calle existente; el operador debe confirmar el resultado y sus referencias. Elegir un lugar en la búsqueda del administrador cambia la vista de consulta, no la solicitud original.

## 6. Publicar en GitHub Pages

La raíz del repositorio contiene `index.html` y `admin.html`. En **Settings → Pages** selecciona publicación desde la rama **main**, carpeta **/(root)**. La URL esperada, una vez habilitado Pages, es:

`https://devnnex.github.io/TOC-TOC-DOMICILIOS.COM/`

El repositorio no configura un dominio personalizado ni modifica DNS. Para un dominio propio, añádelo en Pages y configura el DNS con tu proveedor. Usa HTTPS: el GPS no funciona sobre HTTP público.

`Code.gs`, el manifiesto y las pruebas pueden estar en el repositorio: no contienen credenciales. Todas las claves privadas, el secreto HMAC y el código inicial viven en Script Properties, fuera de GitHub. El flujo de GitHub Actions ejecuta verificaciones y pruebas en cada push a main.

## 7. Prueba real antes de operar

1. En admin, pulsa **Activar alertas** y luego **Configuración → Probar sonido y voz**.
2. En otro dispositivo, abre index, toca el botón circular **Solicitar domicilio**, autoriza el GPS y confirma el punto, nombre y celular con datos de prueba identificables.
3. Mantén la página del cliente abierta. En admin verifica el nombre, dirección y mapa.
4. Acepta asignando domiciliario, celular y tarifa. El cliente debe ver el cambio y escuchar el aviso si permite audio.
5. Completa el servicio y comprueba historial y estadísticas.
6. Verifica la dirección automática, precisión y actualización de última ubicación. Repite denegando GPS y usando la búsqueda manual dentro de la página.
7. Revisa que el cliente pueda cancelar antes de aceptar y que no pueda hacerlo después desde ese botón.
8. Crea un administrador de prueba, cambia su contraseña inicial y confirma que no puede gestionar usuarios.

No se implementan pagos, tarifas automáticas, seguimiento GPS del domiciliario ni una promesa de tiempo de llegada. El equipo informa la tarifa y los datos del domiciliario al aceptar.

## Mantenimiento y solución de problemas

### Avisos fuera de la página y aplicación instalada

**Actualizar una instalación existente a 1.3:** copia **todo** [Code.gs](Code.gs), incluido su bloque final de firma, y [appsscript.json](appsscript.json). Ejecuta `setup()` de nuevo y autoriza el permiso adicional de conexiones externas. Conserva las hojas y sus datos. En **Implementar → Gestionar implementaciones → Editar → Nueva versión**, actualiza la aplicación web existente y conserva su misma URL `/exec`. Un push a GitHub actualiza la web; no actualiza el proyecto de Google.

1. Ingresa como jefe y pulsa **Activar avisos**. También está en **Configuración → Activar avisos al salir**. Acepta el permiso del navegador. La primera activación genera las claves con WebCrypto y reserva la privada en Script Properties, solo mediante una cuenta de jefe autenticada. No hay que pegar ninguna clave en el código público.
2. Cada administrador activa los avisos en su propio dispositivo, después de cambiar su contraseña inicial. El permiso se limita a los servicios de su ciudad y sigue funcionando al vencer la sesión de ocho horas; abrir datos del panel sigue exigiendo iniciar sesión. Cerrar sesión desactiva los avisos de esa cuenta en ese dispositivo. Desactivar la cuenta bloquea sus entregas.
3. El cliente, después de enviar, pulsa **Activar avisos al salir** en su seguimiento. Solo recibe novedades de su servicio. Si ya lo aceptaron antes de activar, se recupera el estado actual. No se difunden domicilios ni teléfonos en la pantalla bloqueada.
4. Usa **Probar un aviso** en Configuración y luego prueba una solicitud y su aceptación con las páginas cerradas, en dos dispositivos reales. No envíes solicitudes ficticias al negocio durante una operación activa.
5. **Instalar app** añade la experiencia a la pantalla de inicio cuando el navegador lo permite. En iPhone/iPad, añade la página a inicio desde Compartir y abre esa aplicación para habilitar los avisos. Cliente y equipo tienen accesos instalables independientes.

Los avisos usan Web Push real con VAPID y un service worker, no sondeos en una pestaña oculta. El servidor envía una señal sin datos personales; el worker consulta una bandeja con permiso limitado y muestra el estado. La entrega se solicita por separado de la respuesta del servicio para no bloquear la confirmación. `setup()` crea `deliverPushQueue` cada minuto como respaldo y para reintentos, además de `dailyMaintenance`. Un error temporal aplica hasta seis intentos con espera creciente; un destino caducado se desactiva. Revisar `PushEvents.state` y `lastError` permite diagnosticar sin registrar secretos.

El permiso de avisos del equipo vence en un año y el del cliente en 30 días; al volver a la página se renueva si está próximo a vencer. Las suscripciones y destinos permanecen privados en Sheets. Solo se permiten proveedores conocidos de Chrome/Firefox/Apple/Windows mediante HTTPS; no se aceptan destinos arbitrarios. El límite de UrlFetch, ejecuciones y disparadores de Apps Script también aplica: no hay garantía de latencia constante ni de entrega ilimitada.

La app puede recibir avisos cerrada o en reposo si el navegador y el sistema permiten despertar el servicio. **No puede garantizar entrega si el equipo está apagado, sin conexión, con notificaciones bloqueadas o el navegador detenido por el sistema.** Los modos de concentración y ahorro de batería pueden retrasar o silenciar avisos. La voz funciona dentro de la página tras una interacción; fuera de ella el sonido lo controla el dispositivo. El inicio se puede abrir sin conexión después de cargarlo una vez, pero solicitar o actualizar servicios requiere conexión y confirmación del servidor. La caché del worker no almacena respuestas privadas de la API.

Referencias: [Web Push en iPhone/iPad](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [protocolo Web Push](https://www.rfc-editor.org/rfc/rfc8030.html), [identificación VAPID](https://www.rfc-editor.org/rfc/rfc8292.html).

### Diagnóstico

- **No conecta o devuelve HTML:** revisa `/exec`, acceso Cualquier persona, versión implementada y permisos del propietario. No reemplaces fetch por `no-cors`.
- **No suena:** pulsa el botón de audio; comprueba volumen, permisos de sonido y voces disponibles. Para avisos fuera de la página, sigue la activación anterior y comprueba los permisos y los modos de silencio del dispositivo.
- **No hay GPS:** usa HTTPS, activa ubicación y permisos del navegador, o escribe manualmente.
- **Mapa vacío:** revisa conexión, bloqueadores y que el navegador permita cargar los iframes de Google. Si Street View no tiene imágenes del lugar, vuelve a Mapa o Satélite. No necesitas una clave.
- **No aparece el nombre de la calle:** actualiza Code.gs y la implementación a la versión 1.2.0 o posterior; revisa las cuotas de Maps. Mientras tanto, puedes confirmar el GPS o escribir la dirección y una referencia.
- **El contador muestra un servicio pero falta la tarjeta:** actualiza la web con recarga completa. La versión 1.2.0 corrige celulares numéricos de Sheets, confirma la revisión después del renderizado y recupera listas vacías. No edites ni elimines solicitudes para intentar corregirlo.
- **Contraseña inicial:** el panel exige cambiarla antes de aceptar servicios.
- **Cuotas o exceso de solicitudes:** consulta la página oficial de cuotas y reduce carga; la interfaz aplica espera creciente. Sheets no ofrece capacidad ilimitada.
- **Edición manual del Sheet:** puede romper contadores o versiones. Usa el panel para operar; conserva los encabezados y las columnas.
- **Revisar mantenimiento:** consulta `System.maintenanceAt` y el disparador `dailyMaintenance` del proyecto. También se comprueba al iniciar sesión y se agenda en segundo plano si hace falta. Conserva solicitudes, historial, usuarios, auditoría y estadísticas; elimina únicamente sesiones vencidas y renueva caché temporal. El archivado de servicios cerrados de más de 30 días verifica la copia completa antes de retirarlos de Requests y mantiene sus datos en Archive. No equivale a una copia de seguridad.

La conservación del historial y el texto de privacidad deben corresponder a la política real del negocio. Para solicitudes de eliminación, el propietario debe gestionar las filas correspondientes en Requests/Archive y documentar la acción, conservando únicamente agregados sin datos personales. El mantenimiento no elimina automáticamente datos del negocio por antigüedad. El historial puede crecer con el uso: revisa las cuotas y la capacidad de Sheets sin prometer una rapidez constante para un volumen ilimitado.

**Actualizar desde la primera versión:** reemplaza todo Code.gs por el archivo actualizado, guarda y actualiza la implementación web a una nueva versión conservando su URL /exec. Los disparadores ya creados usan la función actualizada al guardar el proyecto; no debes recrear las hojas ni eliminar registros. El nuevo código retira la antigua eliminación automática de solicitudes y auditoría de más de 90 días. No recupera datos que una versión anterior ya hubiera eliminado.
