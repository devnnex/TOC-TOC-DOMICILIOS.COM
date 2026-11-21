# Acuerdos del proyecto TOC TOC

- Aplicación con index.html para clientes, admin.html para el equipo y Code.gs como backend de Google Sheets. Mantener el Sheet configurado y la URL /exec existentes salvo instrucción expresa.
- Primer acceso obligatorio: si Users no tiene cuentas, admin.html debe mostrar automáticamente la creación del jefe. Después debe mostrar el ingreso normal. El estado público nunca revela correos, usuarios, contraseñas ni el código privado.
- Crear al primer jefe exige el código privado emitido por setup(). No introducir cuentas predeterminadas ni permitir que el navegador asigne roles o se salte esa autorización. Los jefes crean administradores desde el panel.
- No eliminar automáticamente solicitudes, historial, auditoría, usuarios ni estadísticas por antigüedad. El mantenimiento elimina sesiones vencidas y renueva caché; archiva servicios cerrados de más de 30 días verificando la copia completa antes de retirar el original de Requests.
- Mantener el mantenimiento diario y su comprobación al ingresar, con ejecución en segundo plano para no frenar el acceso.
- Preservar GPS o dirección manual, consultas limitadas a la ciudad del operador, seguimiento, avisos con sonido y voz, animaciones de espera y aceptación, historial y KPIs.
- Diseño juvenil, premium y con sensación de velocidad: moto negra del tipo de referencia, casco abierto con visor y sin caja ni equipaje en la ilustración. Mantener la imagen optimizada.
- Inicio del cliente: logo, moto y un botón circular animado inspirado en Ben 10. Al tocarlo se pide GPS y se abre la confirmación con dirección y mapa; los detalles opcionales no deben volver a ocupar el inicio.
- Google Maps debe funcionar incrustado sin pedir al usuario una clave de navegador. La dirección y búsqueda se resuelven con el servicio Maps de Apps Script, validando ciudad y cuotas. No sustituir las coordenadas originales por el punto aproximado de la geocodificación. Mostrar la precisión sin prometer una puerta exacta. Mover el iframe no cambia la recogida.
- Si el contador muestra una solicitud, su tarjeta debe quedar visible. Normalizar celulares numéricos de Sheets; no confirmar la revisión del sondeo antes de terminar el renderizado; conservar una vista resumida si falla un detalle. Los mapas no deben bloquear el listado.
- Mantener HTML/CSS/JS nativos y una carga ligera. No prometer respuesta instantánea del servidor: depende de Apps Script y de sus cuotas. Respetar reducción de movimiento y requisitos de interacción para audio.
- Ejecutar las verificaciones y pruebas apropiadas. Los tests del navegador usan el backend en memoria y deben estar aislados del Sheet real.
- Si cambia Code.gs, avisar que el propietario debe copiarlo a Apps Script y actualizar la implementación conservando /exec. Un push a GitHub no actualiza Apps Script.
- Los cambios autorizados del proyecto se entregan en main del repositorio devnnex/TOC-TOC-DOMICILIOS.COM. No subir secretos ni datos reales del negocio.
