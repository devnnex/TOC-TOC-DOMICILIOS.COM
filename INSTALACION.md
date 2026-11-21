# Instalación de TOC TOC

## 1. Preparar Google Sheets

Abre el Sheet `1RY7f8Xuel5-tK9e_PQhXgscinU8AQN45pge5p-f16u8` con una cuenta que pueda editarlo. En **Extensiones → Apps Script**, reemplaza el contenido del archivo de código por todo [Code.gs](Code.gs). El nombre del archivo puede ser `Code` o `code`: las funciones son las mismas.

En configuración del proyecto, elige la zona horaria **America/Bogota**, habilita mostrar `appsscript.json` y pega [appsscript.json](appsscript.json). Guarda y ejecuta **`setup()`**. Autoriza los permisos solicitados de Sheets y creación del disparador diario. El ID del Sheet ya está incluido.

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

Abre `admin.html` desde HTTPS o el servidor local. Elige **Estoy instalando el sistema por primera vez**. Escribe nombre, correo de acceso, contraseña de mínimo 12 caracteres y el código del registro de `setup()`. No se necesita que ese correo esté conectado con Google: es el identificador de una cuenta privada de esta aplicación.

El código de instalación se elimina al crear el primer jefe. Después se ingresa con correo y contraseña. No hay cuentas ni claves de ejemplo para producción. Para recuperar un jefe sin sesión, el propietario del proyecto puede emitir temporalmente un nuevo usuario de recuperación desde Apps Script o restablecer el verificador con un procedimiento controlado; no existe una puerta pública de recuperación que evite la autenticación.

Dentro de **Mi equipo**, el jefe crea administradores. Debe comunicarles la contraseña inicial por un canal privado. Cada administrador debe cambiarla al ingresar. Desactivarlo cierra sus sesiones. Restablecer su contraseña también revoca sus sesiones anteriores.

## 4. Google Maps premium

En un proyecto de Google Cloud con facturación habilitada, activa **Maps JavaScript API**, **Places API (New)** y **Maps Embed API**. Crea una clave de navegador y restríngela:

- Por referente HTTP: el dominio de producción y las rutas necesarias. Para GitHub Pages: `https://devnnex.github.io/*`. Añade localhost solo si vas a probar allí.
- Por API: exclusivamente las tres APIs anteriores.

Introduce esa clave pública restringida en `mapsApiKey` de `config.js`. Configura alertas de presupuesto y cuotas según tu operación. La clave de navegador es visible por diseño; sus restricciones son obligatorias para controlar su uso. Nunca uses una clave de servidor sin restricciones.

La búsqueda usa **PlaceAutocompleteElement** con país Colombia y límites de la ciudad. El servidor valida coordenadas contra el radio operativo. El administrador puede consultar un mapa, acercarlo, arrastrarlo y pasar a Street View. Si no hay cobertura de Street View, vuelve al mapa. Google no garantiza fotos recientes de todas las casas. El modo sin clave conserva el enlace de consulta en Google Maps y la dirección manual; no presenta un mapa ficticio como si fuera GPS real.

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
2. En otro dispositivo, abre index y solicita un servicio manual con datos de prueba identificables.
3. Mantén la página del cliente abierta. En admin verifica el nombre, dirección y mapa.
4. Acepta asignando domiciliario, celular y tarifa. El cliente debe ver el cambio y escuchar el aviso si permite audio.
5. Completa el servicio y comprueba historial y estadísticas.
6. Repite con GPS, autorizándolo; verifica precisión, referencias y actualización de última ubicación.
7. Revisa que el cliente pueda cancelar antes de aceptar y que no pueda hacerlo después desde ese botón.
8. Crea un administrador de prueba, cambia su contraseña inicial y confirma que no puede gestionar usuarios.

No se implementan pagos, tarifas automáticas, seguimiento GPS del domiciliario ni una promesa de tiempo de llegada. El equipo informa la tarifa y los datos del domiciliario al aceptar.

## Mantenimiento y solución de problemas

- **No conecta o devuelve HTML:** revisa `/exec`, acceso Cualquier persona, versión implementada y permisos del propietario. No reemplaces fetch por `no-cors`.
- **No suena:** pulsa el botón de audio; comprueba volumen, permisos de sonido y voces disponibles. Bloquear el teléfono o suspender la pestaña puede impedir avisos. La interfaz sigue mostrando el estado.
- **No hay GPS:** usa HTTPS, activa ubicación y permisos del navegador, o escribe manualmente.
- **Mapa vacío:** revisa facturación, APIs habilitadas, restricciones y cobertura de Street View.
- **Contraseña inicial:** el panel exige cambiarla antes de aceptar servicios.
- **Cuotas o exceso de solicitudes:** consulta la página oficial de cuotas y reduce carga; la interfaz aplica espera creciente. Sheets no ofrece capacidad ilimitada.
- **Edición manual del Sheet:** puede romper contadores o versiones. Usa el panel para operar; conserva los encabezados y las columnas.
- **Revisar mantenimiento:** consulta `System.maintenanceAt` y el disparador `dailyMaintenance` del proyecto. También se comprueba al iniciar sesión. La limpieza de datos a los 90 días es intencional y no equivale a una copia de seguridad.

La retención de 90 días y el texto de privacidad son decisiones iniciales visibles del producto; ajústalos a la política real del negocio antes de abrir al público. Para solicitudes de eliminación, el propietario debe eliminar las filas correspondientes en Requests/Archive y documentar la acción, conservando únicamente agregados sin datos personales.
