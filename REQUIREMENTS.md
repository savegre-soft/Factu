# Requerimientos — Factu

Estado real del código a **2026-08-09**. Este documento se actualiza en la misma
sesión en que se completa cada tarea/feature/fix (ver reglas en `CLAUDE.md`).

Leyenda: ✅ Implementado · 🟡 Parcial · ⬜ Pendiente

## A. Autenticación y Control de Acceso

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| A1 | Registro de organización | `POST /auth/registro` crea el tenant + usuario admin y devuelve JWT. | ✅ Implementado | `src/routes/auth.ts:96`. Además deja la sesión en la cookie `httpOnly` (ver L3). |
| A2 | Login de usuario | `POST /auth/login` valida credenciales (scrypt) y devuelve JWT. | ✅ Implementado | `src/routes/auth.ts:117`. `POST /auth/logout` borra la cookie de sesión. |
| A3 | Multi-tenant | Datos aislados por `tenantId` en todos los modelos (usuarios, emisores, comprobantes, etc.). | ✅ Implementado | `prisma/schema.prisma`, guards en `src/routes/_guards.ts`. |
| A4 | Roles y permisos | Roles `admin` / `facturador` / `lector` con permisos atómicos (gestionar usuarios/emisores/integraciones/notificaciones, emitir, leer). | ✅ Implementado | `src/domain/auth/roles.ts`. |
| A5 | Gestión de usuarios | Admin crea/lista/edita rol/cambia password/elimina usuarios de su tenant. | ✅ Implementado | `src/routes/auth.ts` (`/auth/usuarios*`). |
| A6 | Login social (OAuth) | Vincula identidad Google/Microsoft a un usuario; login por proveedor; listar/desvincular identidades. | ✅ Implementado | `src/routes/auth.ts` (`/auth/oauth/*`), `src/services/cuentas/oauthProviders.ts`. El `state` va firmado con HMAC y vencimiento a 10 min (`src/services/cuentas/estado.ts`) para que un callback no se pueda falsificar; transporta la intención (`login`/`link`) sin estado en servidor. |
| A7 | Recuperar contraseña | Código de un solo uso enviado por correo de la plataforma, con expiración. | ✅ Implementado | `src/services/cuentas/passwordResetService.ts`, `/auth/password/*`. Usa el SMTP propio de la plataforma (`PLATAFORMA_SMTP_*`, `src/services/cuentas/mailerPlataforma.ts`), distinto del SMTP con el que se entregan comprobantes. |
| A8 | API Keys (integraciones) | Credenciales de servicio con rol efectivo y alcance por emisor, para emitir desde sistemas externos (ERP, etc.). | ✅ Implementado | `src/services/apiKeys/apiKeyService.ts`, `/api-keys/*`. Se presentan como `Authorization: Bearer factu_…`; `src/plugins/auth.ts` las distingue del JWT por el prefijo. |
| A9 | Perfil propio | `GET/PATCH /auth/yo`, cambio de password propio. | ✅ Implementado | `src/routes/auth.ts:277`. |

## B. Emisores y Certificados

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| B1 | Alta/edición de emisor | Registrar cédula, nombre y datos fiscales (actividad, ubicación, correo). | ✅ Implementado | `src/routes/emisor.ts`. |
| B2 | Certificado .p12 cifrado | Sube el `.p12` en base64 + PIN; se valida y se guarda cifrado en reposo (AES-256-GCM). | ✅ Implementado | `src/services/emisor/certStore.ts`, `src/infra/crypto/secretBox.ts`. Rotación de llave con `scripts/rotar-llave-maestra.mjs`. |
| B3 | Sesión IDP Hacienda | Login del emisor contra el IDP, obtención/renovación automática de tokens, logout. | ✅ Implementado | `src/services/auth/haciendaAuth.ts`, `src/services/auth/tokenStore.ts`, `/hacienda/*`. Los errores del IDP se clasifican con `src/domain/auth/erroresIdp.ts`: Keycloak devuelve `400 invalid_grant` cuando el usuario/clave están mal, y antes eso se reportaba como caída de Hacienda (502) en vez de 401. |
| B4 | Consulta de ambiente | Expone (solo lectura) si está en `stag`/`prod`, URLs públicas y si está "listo para producción". | ✅ Implementado | `src/routes/ambiente.ts`, `src/config/hacienda.ts`. `listoParaProduccion = ambiente prod && política de firma configurada`. |
| B5 | Certificado real vs. demo | Si el emisor no tiene `.p12` cargado, firma con uno autofirmado de prueba y lo marca (`certificadoDemo: true`) — Hacienda solo acepta el real. | ✅ Implementado | Comportamiento intencional para desarrollo, documentado en `docs/conexion-hacienda.md`. Aplica a `/comprobante/:tipo/enviar`; el REP (D10) exige certificado real. |
| B6 | Credenciales oficiales de producción | URLs oficiales del IDP/recepción de Hacienda (stag y prod) confirmadas y probadas contra el sandbox real. | 🟡 Parcial | Las URLs y el `client_id` de ambos ambientes ya viven en el código, derivados de `HACIENDA_ENV` (`src/config/hacienda.ts`: realm `rut-stag` + `api-sandbox` para pruebas, realm `rut` + `api` para producción), y se pueden sobrescribir con `HACIENDA_IDP_URL`/`HACIENDA_API_URL`/`HACIENDA_CLIENT_ID`. **Confirmadas en vivo el 2026-08-09**: Hacienda aceptó una factura emitida contra su sandbox real, con certificado y credenciales reales (consecutivo `00100001010000000002`, emisor `207820791`). Eso valida el IDP, la recepción y el `client_id` de pruebas. Las de producción siguen sin estrenarse. |
| B7 | Sesiones de Hacienda persistidas | Los tokens del IDP sobreviven a un reinicio de la API, cifrados en reposo. | ✅ Implementado | Modelo `SesionHacienda` + `src/services/auth/almacenSesiones.ts` (`AlmacenSesionesCifrado`). El `TokenStore` mantiene el caché en memoria y este almacén es su respaldo: el `TokenSet` se sella con la llave maestra igual que un `.p12`. Un refresh vencido, o un dato que no se puede descifrar (llave rotada sin recifrar), se descarta y obliga a iniciar sesión de nuevo en vez de romper la emisión. |

## C. Clientes / Receptores

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| C1 | Autocompletar receptor | Guarda cada receptor usado en una factura (por tenant + número de identificación) para autocompletar en la siguiente emisión. | ✅ Implementado | Modelo `Cliente` en `prisma/schema.prisma`, `GET /clientes`, `GET /clientes/:numero` en `src/routes/emisor.ts:119`. El guardado es best-effort tras emitir: si falla, se registra un warn y la emisión no se ve afectada. |

## D. Emisión de Comprobantes Electrónicos

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| D1 | Clave y consecutivo | Genera la clave numérica de 50 dígitos y el consecutivo de 20. | ✅ Implementado | `src/domain/clave/clave.ts`, `POST /clave`. `TipoComprobante` cubre 01–10, incluidos FEC (08), FEE (09) y REP (10). |
| D2 | XML v4.4 | Genera el XML de todos los tipos de comprobante. | ✅ Implementado | `src/domain/factura/facturaXml.ts` (`FE`, `TE`, `NC`, `ND`, `FEC`, `FEE`), `src/domain/reciboPago/reciboPagoXml.ts` (`REP`) y `src/domain/mensajeReceptor/mensajeReceptor.ts`. |
| D3 | Validación de negocio previa | Reglas que fallan antes de contactar a Hacienda: formatos, receptor obligatorio (salvo tiquete), plazo de crédito, tipo de cambio, CABYS de 13 dígitos, tarifas 0–100, referencias en notas. | ✅ Implementado | `src/domain/validacion/validacion.ts`. El código de actividad acepta CIIU4 con punto (`8549.0`, como lo devuelve `/fe/ae` del RUT en TRIBU-CR) y los CIIU3 viejos de 6 dígitos (`620100`): el XSD v4.4 lo define como 6 **caracteres**, no 6 dígitos. Las referencias exigen la clave de 50 dígitos del documento referenciado. |
| D4 | Firma XAdES | Firma enveloped XAdES-BES, o XAdES-EPES si hay política de firma configurada. | ✅ Implementado | `src/services/firma/xadesSigner.ts`. `.env.example` ya trae la política de la resolución DGT-R-48-2016 v4.1 (`HACIENDA_POLICY_URL` + `HACIENDA_POLICY_HASH`), así que por defecto se firma EPES; sin esas variables cae a BES y Hacienda responde «La firma del documento no tiene el Policy Id». **Confirmar que la resolución referenciada sigue siendo la vigente antes de producción.** |
| D5 | Envío y estado | Envía a recepción de Hacienda y consulta el estado (aceptado/rechazado/procesando) con polling. | ✅ Implementado | `src/services/hacienda/emision.ts`, `reception.ts`, `envelope.ts` (sobre JSON con el XML en base64). **Probado end-to-end contra el sandbox real el 2026-08-09**: factura aceptada. Falta ejercitar los demás tipos y variantes (ver D13). |
| D6 | Listado/consulta de comprobantes | Lista comprobantes emitidos (filtrable, paginado) y consulta por clave. | ✅ Implementado | `GET /comprobantes`, `GET /comprobante/:clave` en `src/routes/comprobante.ts`. El listado usa `ComprobanteResumen` (sin `xmlFirmado` ni `respuestaXml`, ~13 KB cada uno): traerlos convertía cualquier listado en una descarga de decenas de MB. Paginación común en `src/routes/_pagina.ts` (50 por defecto, 200 máximo). |
| D7 | Borradores | Guardar el estado del formulario de emisión (JSON) y reanudarlo antes de emitir. | ✅ Implementado | `src/services/borradores/borradorService.ts`, `/borradores/*`. |
| D8 | Validación contra XSD oficial | Validar **en tiempo de ejecución** el XML generado contra el esquema XSD v4.4 de Hacienda. | ⬜ Pendiente | El generador se contrastó **a mano, nodo por nodo**, contra los cuatro XSD oficiales (`FacturaElectronica`, `ReciboElectronicoPago`, `FacturaElectronicaCompra`, `FacturaElectronicaExportacion`), lo que destapó cuatro defectos reales que Hacienda habría rechazado (ver D14). Lo que sigue pendiente es la validación **automática** en cada emisión, que atraparía una regresión futura sin depender de que alguien vuelva a leer el esquema. |
| D9 | Gestión de consecutivos por emisor | Autogenerar y controlar el consecutivo de cada emisor/tipo de documento en el servidor. | ✅ Implementado | Modelo `ConsecutivoEmisor` + `reservarConsecutivo()` / `proximoConsecutivo()` / `liberarConsecutivo()` en ambos repositorios (`src/infra/repos/types.ts:731`). La serie es (cédula emisor, sucursal, terminal, tipo) y la reserva es atómica: dos emisiones simultáneas nunca reciben el mismo número. El `consecutivo` del body pasó a ser **opcional** (se acepta como override); si el navegador lo manejara, una recarga o una segunda pestaña repetirían el número y Hacienda rechazaría el comprobante. Si la emisión falla **antes** de que Hacienda vea nada (`alEntregarAHacienda` no se disparó), el número se devuelve a la serie para no dejar huecos; si ya se entregó, el número queda consumido. `GET /comprobante/proximo-consecutivo` expone el próximo número sin consumirlo, para que el formulario lo muestre. |
| D10 | Recibo Electrónico de Pago (REP) | Comprobante nuevo en v4.4: lo emite quien facturó a crédito cuando cobra. | ✅ Implementado | `POST /recibo-pago/enviar` (`src/routes/reciboPago.ts`) + `src/domain/reciboPago/reciboPagoXml.ts`. Sigue el mismo camino que una factura (clave → XML → firma → envío → estado) pero con estructura propia: emisor/receptor sin ubicación ni teléfono, sin código de actividad, y la línea sin CABYS ni cantidad (documenta un monto cobrado, no una venta). `InformacionReferencia` es **obligatoria** (la factura que se cobra) y `MedioPago` también. Tiene su propia serie de consecutivos (`tipo: "REP"`). Se guarda en la tabla `Comprobante` para que aparezca en listados, estadísticas y re-consulta. Emite el evento `recibo-pago.<estado>` y auditoría `recibo-pago.emitir`. |
| D11 | Factura de compra y de exportación | Tipos `FEC` (compra a un no inscrito) y `FEE` (exportación) en el mismo endpoint de emisión. | ✅ Implementado | `POST /comprobante/compra/enviar` y `/comprobante/exportacion/enviar`; mapeo en `RUTA_A_TIPO` (`src/routes/comprobante.ts:31`) y `TipoDocumento.FacturaCompra`/`FacturaExportacion` en `src/domain/factura/facturaXml.ts`. |
| D12 | Re-consulta de comprobantes sin veredicto | Volver a preguntar a Hacienda por los comprobantes que quedaron en «recibido»/«procesando». | ✅ Implementado | `src/services/hacienda/reconsulta.ts` + `pollerReconsulta.ts` (5.º poller, `RECONSULTA_ENABLED` / `RECONSULTA_MINUTOS`, 10 min por defecto). Durante la emisión el estado se espera ~15 s (5 intentos × 3 s); si Hacienda tardaba más, el comprobante se quedaba en «recibido» **para siempre** porque nadie volvía a preguntar. El barrido toma hasta 50 pendientes de los últimos 7 días, y al llegar el veredicto dispara los mismos efectos que habría disparado la emisión (webhook, notificación y entrega al cliente). Nunca lanza: un comprobante que falla no frena el resto ni tumba el poller; sin sesión del emisor se omite y se reintenta en el siguiente barrido. |

| D13 | Cobertura real de los tipos de comprobante | Haber emitido y visto aceptado cada tipo/variante contra Hacienda. | 🟡 Parcial | Aceptada una factura simple (2026-08-09). **Sin ejercitar todavía**: descuentos, líneas exentas, exoneración, nota de crédito, nota de débito, factura de compra, factura de exportación y REP. Todos están verificados contra el XSD y con tests, pero un rechazo por formato solo se descubre enviándolo. La aplicación web lleva la cuenta en su panel de ambiente, calculada a partir de los comprobantes aceptados. |
| D14 | Conformidad del XML con v4.4 | Que el XML generado respete el esquema en los puntos donde v4.4 cambió respecto de v4.3. | ✅ Implementado | Corregidos el 2026-08-09 cuatro defectos que Hacienda habría rechazado: **(1)** las líneas sin impuesto omitían `BaseImponible`, `Impuesto`, `ImpuestoAsumidoEmisorFabrica` e `ImpuestoNeto`, que en el XSD **no llevan `minOccurs="0"`** — una línea exenta se declara ahora con tarifa 0% y monto 0; **(2)** los descuentos no emitían `CodigoDescuento`, obligatorio en v4.4 (por defecto `07`, comercial); **(3)** las notas usaban los nombres de v4.3 `TipoDoc`/`FechaEmision` en vez de `TipoDocIR`/`FechaEmisionIR`, así que **ninguna nota pasaba el esquema**; **(4)** la fecha de la clave se calculaba con la hora local del proceso (UTC en el contenedor) mientras `FechaEmision` usaba el offset de Costa Rica, lo que desfasaba un día toda emisión posterior a las 18:00 CR. |
| D15 | Exoneraciones | Rebajar el impuesto de una línea con el respaldo documental que exige Hacienda. | ✅ Implementado | `Exoneracion` en `src/domain/factura/types.ts` con el catálogo de 12 tipos (`TipoExoneracion`), nodo `Exoneracion` dentro de `Impuesto` en el orden del XSD, y `totalExonerado` en el resumen. La semántica es la del esquema: el `Monto` del impuesto sigue siendo el **bruto** y la rebaja va en `MontoExoneracion`. Cubre zonas francas, instituciones exoneradas y diplomáticos. |
| D16 | Emisión en contingencia | Emitir marcando la situación cuando Hacienda no está disponible. | ✅ Implementado | `situacion` (1 normal, 2 contingencia, 3 sin internet) es un campo opcional de la emisión y viaja en la clave. El enum `SituacionComprobante` existía sin usarse: siempre se emitía como normal, así que una caída de Hacienda dejaba al contribuyente sin poder facturar. |

## E. Documentos Recibidos / Mensaje Receptor

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| E1 | Carga manual de documento recibido | Registrar manualmente un comprobante que la empresa recibió (XML + metadatos). | ✅ Implementado | `POST /recibidos`, `src/services/documentosRecibidos/documentosRecibidosService.ts`. |
| E2 | Recepción automática por correo | Buzón IMAP configurable por tenant; poller que extrae los XML adjuntos/entrantes. | ✅ Implementado | `src/services/correo/correoService.ts`, `src/services/correo/poller.ts`, `/correo/*`. `POST /correo/sincronizar` (solo admin) fuerza un barrido inmediato sin esperar al poller. |
| E3 | Generar Mensaje Receptor | A partir de un documento recibido, genera la respuesta de aceptación/rechazo/aceptación parcial. | ✅ Implementado | `POST /recibidos/:id/mensaje-receptor`, `POST /mensaje-receptor/xml`. |
| E4 | Listado/consulta de recibidos | Lista y consulta documentos recibidos, filtra por emisor/receptor. | ✅ Implementado | `GET /recibidos`, `GET /recibidos/:id`, `DELETE /recibidos/:id`. |
| E5 | Enviar el Mensaje Receptor a Hacienda | Mandar a recepción el mensaje receptor ya generado. | ✅ Implementado | `POST /recibidos/:id/mensaje-receptor/enviar`. Generarlo y no mandarlo no cumple nada: responder es obligación del receptor y tiene plazo. El sobre lleva `consecutivoReceptor` (el consecutivo de 20 dígitos de quien responde) además de la clave del comprobante original — ver `ReceptionEnvelope` en `src/services/hacienda/envelope.ts`. Sin sesión con Hacienda responde 401, no 502. |

## F. Entrega al Cliente

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| F1 | SMTP saliente configurable | Configuración de correo saliente por tenant (host, puerto, TLS/STARTTLS, remitente). | ✅ Implementado | `src/services/entrega/smtpConfigService.ts`, `/correo-salida/*`. |
| F2 | PDF del comprobante | Genera el PDF (representación impresa) del comprobante emitido. | ✅ Implementado | `src/services/entrega/comprobantePdf.ts` (pdfkit). |
| F3 | Envío al cliente + reintentos | Envía el comprobante (XML + PDF) por correo al receptor, con cola de reintentos. | ✅ Implementado | `src/services/entrega/entregaService.ts`, `src/services/entrega/poller.ts`. Solo se dispara si Hacienda **aceptó** y el receptor tiene correo; corre en segundo plano y nunca rompe ni bloquea la respuesta de emisión. |
| F4 | Historial y reenvío | Historial de envíos por comprobante (auditable) y reenvío manual. | ✅ Implementado | `POST /comprobante/:clave/reenviar`, `GET /comprobante/:clave/envios`. |

## G. Estadísticas

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| G1 | Resumen general | Totales agregados (emitidos, aceptados, rechazados, montos). | ✅ Implementado | `GET /estadisticas/resumen`. |
| G2 | Desglose por emisor | Estadísticas agrupadas por emisor del tenant, y detalle de uno solo. | ✅ Implementado | `GET /estadisticas/emisores`, `GET /estadisticas/emisores/:cedula`. |
| G3 | Serie temporal | Serie de emisión en el tiempo (para gráficos). | ✅ Implementado | `GET /estadisticas/serie`, con rango `desde`/`hasta`. |
| G4 | Importes por moneda y mes | Neto facturado por moneda y mes, solo de los comprobantes aceptados. | ✅ Implementado | `GET /estadisticas/montos`. Las notas de crédito **restan**. Los suma la base (`montosPorMoneda`): antes el navegador descargaba el XML de cada comprobante para calcularlos. Los comprobantes viejos sin `total`/`moneda` se rellenan una vez con `scripts/rellenar-totales.mjs`. |

## H. Webhooks (integraciones salientes)

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| H1 | CRUD de webhooks | Alta/edición/baja de endpoints suscritos a eventos (ej. `comprobante.aceptado`). | ✅ Implementado | `src/routes/webhooks.ts`, `src/services/webhooks/webhookService.ts`. Eventos actuales: `comprobante.aceptado`, `comprobante.rechazado`, `recibo-pago.<estado>`. |
| H2 | Firma HMAC | El payload saliente se firma con el secreto configurado del webhook. | ✅ Implementado | Secreto cifrado en reposo (`secretSellado`), firmado al entregar. |
| H3 | Prueba y reintentos | Disparo manual de prueba y reintentos con historial de entregas. | ✅ Implementado | `POST /webhooks/:id/probar`, `GET /webhooks/:id/entregas`, `src/services/webhooks/poller.ts`. |

## I. Notificaciones

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| I1 | Canales soportados | SMS (Twilio), WhatsApp Cloud, Slack, Teams, Bitrix24 y HTTP genérico. | ✅ Implementado | `src/services/notificaciones/providers/*`, patrón Strategy (`NotificationProvider`). `GET /notification-providers` lista los disponibles. |
| I2 | CRUD de canales + prueba | Alta/edición/baja de canal con config cifrada, suscripción a eventos, envío de prueba. | ✅ Implementado | `src/routes/notificaciones.ts`. `GET /notification-events` lista los eventos suscribibles. |
| I3 | Historial y reintentos | Cola de mensajes con reintentos y backoff, historial por canal. | ✅ Implementado | `src/services/notificaciones/retryPolicy.ts`, `src/services/notificaciones/poller.ts`, `GET /notifications`. |

## J. Auditoría y Observabilidad

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| J1 | Registro de auditoría | Acciones de negocio atribuibles a un usuario/API key (login, emitir, crear webhook, etc.). | ✅ Implementado | `src/services/auditoria/index.ts`, `GET /auditoria` (solo admin). |
| J2 | Logs técnicos | Registro de eventos del sistema (pollers, entregas, errores no controlados) con nivel y origen. | ✅ Implementado | `src/services/logs/index.ts`, `GET /logs` (solo admin), hook `onError` en `src/server.ts` (solo 5xx: es un hook de observación, no altera la respuesta). |
| J3 | El proceso no se cae por un poller | Un error no controlado en un poller no debe tumbar la API. | ✅ Implementado | `process.on("unhandledRejection")` / `("uncaughtException")` en `src/main.ts`: se registra y el proceso sigue vivo. Nació de los sockets del poller de correo. |

## K. Colaboración interna

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| K1 | Chat interno | Mensajería 1:1 entre usuarios del mismo tenant, contactos, contador de no leídos. | ✅ Implementado | `src/services/chat/chatService.ts`, `/chat/*`. |

## L. Seguridad de la plataforma

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| L1 | Cabeceras de seguridad HTTP | helmet con `no-referrer`, `nosniff` y HSTS en producción. | ✅ Implementado | `src/plugins/seguridad.ts`. La CSP se desactiva **a propósito**: `/docs` sirve Swagger y Scalar, que cargan sus propios scripts y estilos, y una política restrictiva rompería la documentación sin ganar nada en endpoints que devuelven JSON. Sin `referrerPolicy`, la URL completa de la API viajaría como `Referer` a terceros. |
| L2 | Límite de peticiones | Techo global y límite estricto en rutas de autenticación. | ✅ Implementado | `src/plugins/rateLimit.ts`: 300/min global, **10/min** en `/auth/login`, `/auth/registro`, `/auth/password/olvide`, `/auth/password/reset` y `/hacienda/login` — sin eso, probar contraseñas por fuerza bruta no cuesta nada. La clave es el usuario autenticado cuando lo hay y la IP cuando no, para que una oficina detrás de una sola IP pública no se bloquee entre sí. `/docs`, `/health` y `/` no consumen cupo. El `statusCode` va dentro del cuerpo del error: sin él Fastify respondía 500 en lugar de 429. |
| L3 | Sesión en cookie `httpOnly` | El JWT del navegador deja de vivir en `localStorage`. | ✅ Implementado | `src/plugins/sesionCookie.ts` (cookie `factu_sesion`, `httpOnly`, `SameSite=lax`, `secure` cuando `NODE_ENV=production` y `API_PUBLIC_URL` es https, `maxAge` derivado de `JWT_EXPIRES_IN`). Antes cualquier XSS podía leer el token y llevarse la sesión completa; ahora un XSS puede actuar mientras la pestaña está abierta pero no exfiltrar el token. El header `Authorization: Bearer` se mantiene para API keys y clientes que no son navegadores. |
| L4 | Defensa CSRF en servidor | Con la sesión en cookie, el navegador la adjunta sola. | ✅ Implementado | `origenPropio()` en `src/plugins/auth.ts`: en `POST`/`PUT`/`PATCH`/`DELETE` autenticados por cookie, el `Origin` debe coincidir con el host de la petición o con `APP_URL`; si no, 403. `SameSite=lax` ya lo bloquea, pero esa es una defensa del navegador — esta es la del servidor. Sin `Origin` se acepta (clientes no-navegador, que además usan el header y no la cookie). |
| L5 | Documentación interactiva apagada en producción | `/docs` y `/swagger` exponen el mapa completo de la API sin autenticación. | ✅ Implementado | `src/plugins/swagger.ts`: encendida en desarrollo, apagada en producción, salvo `DOCS_PUBLICAS=true` explícito. |

## M. Despliegue

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| M1 | Compose para servidor | Stack de despliegue distinto al de la laptop. | ✅ Implementado | `docker-compose.server.yml` (2026-08-16). Se separó de `docker-compose.yml` por dos razones concretas del servidor `mecsa00`: **(1)** la base **no** publica el 5432 en el host — ahí ya escucha `supabase-pooler`, y publicarlo hacía fallar el arranque; **(2)** `APP_URL`/`API_PUBLIC_URL` apuntan a `192.168.1.3`, no a `localhost`. `APP_URL=http://192.168.1.3:8080` no es cosmético: es el `Origin` que acepta el chequeo anti-CSRF (L4), y con `localhost` toda escritura desde el navegador daría 403. Lleva `DOCS_PUBLICAS=true` (red local) y la política EPES, que el compose anterior del servidor **no** tenía — firmaba BES y Hacienda habría rechazado toda emisión. |
| M2 | Despliegue en mecsa00 (192.168.1.3) | API + webapp corriendo en el servidor de la red local. | ✅ Implementado | Desplegado el **2026-08-16**. API en `:3000` (`factu-app-1` + `factu-db-1`), webapp en `:8080` (`factuweb-web-prod-1`, nginx sirviendo el SPA y haciendo proxy `/api`→API y `/hacienda-pub`→Hacienda). El servidor es compartido (supabase, wapi, e7r, e8a, pulpepos): por eso 3000 y 8080 son los únicos puertos que toma este stack, y el 5432 se dejó libre. `~/Factu` y `~/FactuWeb` **no son repos git**: el código se sincroniza por `tar` sobre ssh, borrando antes `src/`, `prisma/`, `scripts/` y `docs/` para que no queden archivos viejos. Verificado en vivo: `/health` → `{"status":"ok"}`, `/ambiente` → `politicaFirma: true`, `/docs` y `/swagger` → 200, web → 200, y ambos proxies del nginx respondiendo. |
| M3 | Migración de datos laptop → servidor | Llevar los datos reales de desarrollo al servidor. | ✅ Implementado | 2026-08-16, a pedido explícito. `pg_dump --clean --if-exists --no-owner` del `factu_pgdata` local (304 KB, 22 tablas) restaurado sobre el remoto; verificado después: 11 comprobantes, 2 emisores, 1 usuario — idéntico al origen. **La condición crítica fue copiar también el `.env` local**: las llaves local y remota eran distintas (`FACTU_MASTER_KEY` sha256 `6ea58473…` vs `f7b6fd32…`), y como los `.p12` y los tokens del IDP viajan cifrados dentro del dump, restaurarlo contra la llave vieja los habría dejado ilegibles sin error visible — se descubren rotos al intentar firmar. Cambiar `JWT_SECRET` invalidó de paso las sesiones de navegador abiertas contra el servidor. Antes de sobrescribir se respaldó lo que había en `~/factu-backups/` (dump de 31 KB + `.env`, ambos `chmod 600`); el dump temporal se borró de `/tmp` al terminar. |

---

## Orden de trabajo sugerido

Prioridad por dependencia real de datos/acceso, no alfabética:

1. **D13 — Ejercitar los tipos de comprobante que faltan.**
   La factura simple ya fue aceptada (2026-08-09), pero descuentos, líneas exentas,
   exoneración, notas, compra, exportación y REP nunca se han enviado. Cuestan minutos
   cada uno y son el riesgo abierto más grande: un rechazo por formato solo aparece
   enviándolo. La web lleva la cuenta en su panel de ambiente.
2. **D8 — Validación automática contra el XSD oficial v4.4.**
   El contraste manual contra los cuatro esquemas ya destapó cuatro defectos (D14), pero
   fue un ejercicio puntual: sin validación en tiempo de ejecución, una regresión futura
   vuelve a descubrirse en producción. No depende de credenciales de Hacienda.
3. **D4 — Confirmar la política de firma en producción.**
   En pruebas, la resolución configurada es aceptada —lo demostró la emisión del
   2026-08-09—. Falta comprobarlo en el ambiente real.

## Notas generales

- **Verificación de este documento (2026-08-09)**: el estado se derivó leyendo el código y
  corriendo la suite completa — `npm test` → **30 archivos, 209 tests, todos en verde**. Los
  endpoints nuevos (D10, D12, E5, G4) no se ejercitaron con `curl` en esta sesión: están
  cubiertos por tests, no por verificación en vivo.
- **Persistencia dual**: todo el dominio corre igual sobre backend en memoria
  (`PERSISTENCIA=memoria`, para desarrollo/tests) o Prisma/PostgreSQL
  (`PERSISTENCIA=prisma`). Cualquier feature nueva debe implementarse en ambos repos
  (`src/infra/repos/memory.ts` y `src/infra/repos/prisma.ts`) para no romper los tests
  unitarios que corren en memoria.
- **Secretos cifrados en reposo**: `.p12`, tokens del IDP de Hacienda, contraseñas
  SMTP/IMAP, secretos de webhook y config de canales de notificación se guardan como
  `SecretoSellado` (JSON cifrado AES-256-GCM con `FACTU_MASTER_KEY`). Nunca se devuelven en
  claro por la API. Rotar la llave exige recifrar con `scripts/rotar-llave-maestra.mjs`.
- **`FACTU_MASTER_KEY` y `JWT_SECRET`** tienen valores inseguros por defecto solo en
  desarrollo; en producción son obligatorios (el arranque falla si faltan).
- **Nada de fallos posteriores reportados como fallo de emisión**: una vez que Hacienda vio
  el comprobante, ningún error posterior (persistencia, cliente, webhook, entrega) puede
  responderse como «fallo al emitir» — el usuario reintentaría y duplicaría el documento.
  Si la base falla después de emitir, la respuesta incluye una `advertencia` con la clave.
- El dominio (`src/domain/`) es lógica pura sin infraestructura — 100% testeable sin red
  ni certificados reales; los servicios (`src/services/`) inyectan sus dependencias.
