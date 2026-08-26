# Requerimientos — Factu

Estado real del código a **2026-07-29**. Este documento se actualiza en la misma
sesión en que se completa cada tarea/feature/fix (ver reglas en `CLAUDE.md`).

Leyenda: ✅ Implementado · 🟡 Parcial · ⬜ Pendiente

## A. Autenticación y Control de Acceso

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| A1 | Registro de organización | `POST /auth/registro` crea el tenant + usuario admin y devuelve JWT. | ✅ Implementado | `src/routes/auth.ts:94`. |
| A2 | Login de usuario | `POST /auth/login` valida credenciales (scrypt) y devuelve JWT. | ✅ Implementado | `src/routes/auth.ts:112`. |
| A3 | Multi-tenant | Datos aislados por `tenantId` en todos los modelos (usuarios, emisores, comprobantes, etc.). | ✅ Implementado | `prisma/schema.prisma`, guards en `src/routes/_guards.ts`. |
| A4 | Roles y permisos | Roles `admin` / `facturador` / `lector` con permisos atómicos (gestionar usuarios/emisores/integraciones/notificaciones, emitir, leer). | ✅ Implementado | `src/domain/auth/roles.ts`. |
| A5 | Gestión de usuarios | Admin crea/lista/edita rol/cambia password/elimina usuarios de su tenant. | ✅ Implementado | `src/routes/auth.ts` (`/auth/usuarios*`). |
| A6 | Login social (OAuth) | Vincula identidad Google/Microsoft a un usuario; login por proveedor; listar/desvincular identidades. | ✅ Implementado | `src/routes/auth.ts` (`/auth/oauth/*`), `src/services/cuentas/oauthProviders.ts`. |
| A7 | Recuperar contraseña | Código de un solo uso enviado por correo de la plataforma, con expiración. | ✅ Implementado | `src/services/cuentas/passwordResetService.ts`, `/auth/password/*`. |
| A8 | API Keys (integraciones) | Credenciales de servicio con rol efectivo y alcance por emisor, para emitir desde sistemas externos (ERP, etc.). | ✅ Implementado | `src/services/apiKeys/apiKeyService.ts`, `/api-keys/*`. |
| A9 | Perfil propio | `GET/PATCH /auth/yo`, cambio de password propio. | ✅ Implementado | `src/routes/auth.ts:262`. |

## B. Emisores y Certificados

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| B1 | Alta/edición de emisor | Registrar cédula, nombre y datos fiscales (actividad, ubicación, correo). | ✅ Implementado | `src/routes/emisor.ts`. |
| B2 | Certificado .p12 cifrado | Sube el `.p12` en base64 + PIN; se valida y se guarda cifrado en reposo (AES-256-GCM). | ✅ Implementado | `src/services/emisor/certStore.ts`, `src/infra/crypto/secretBox.ts`. |
| B3 | Sesión IDP Hacienda | Login del emisor contra el IDP, obtención/renovación automática de tokens, logout. | ✅ Implementado | `src/services/auth/haciendaAuth.ts`, `src/services/auth/tokenStore.ts`, `/hacienda/*`. |
| B4 | Consulta de ambiente | Expone (solo lectura) si está en `stag`/`prod`, URLs públicas y si está "listo para producción". | ✅ Implementado | `src/routes/ambiente.ts`, `src/config/hacienda.ts`. |
| B5 | Certificado real vs. demo | Si el emisor no tiene `.p12` cargado, firma con uno autofirmado de prueba y lo marca (`certificadoDemo: true`) — Hacienda solo acepta el real. | ✅ Implementado | Comportamiento intencional para desarrollo, documentado en `docs/conexion-hacienda.md`. |
| B6 | Credenciales oficiales de producción | URLs oficiales del IDP/recepción de Hacienda (stag y prod) confirmadas y probadas contra el sandbox real. | 🟡 Parcial | (2026-07-31) Las URLs de `stag` ya configuradas por defecto (`idp.comprobanteselectronicos.go.cr/.../rut-stag`, `api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1`) quedaron **confirmadas reales** con una prueba de punta a punta genuina: login real contra el IDP con credenciales reales de un contribuyente físico registrado en sandbox (`usuario cpf-02-...@stag.comprobanteselectronicos.go.cr`) devolvió un access/refresh token real (200); un tiquete de prueba emitido con su certificado `.p12` real llegó realmente a Hacienda (recepción real, HTTP 202, clave/consecutivo reales) — el rechazo final fue por datos de negocio inventados en la prueba (ubicación/actividad económica no coinciden con lo registrado para esa cédula, ver B9), no por la URL/IDP en sí. Sigue 🟡 y no ✅ porque las URLs de **prod** no se han probado (no hay credenciales de producción disponibles) y falta decidir cómo RestroCloud conseguirá/gestionará credenciales reales de cada cliente para ir a producción — eso es trabajo de producto, no técnico. |
| B7 | API keys de servicio pueden gestionar su propio emisor | Una API key `facturador` ya scoped a una cédula puede registrar/actualizar ese emisor y subir su certificado `.p12`, sin necesitar credenciales de un usuario humano admin. | ✅ Implementado | (2026-07-30) Gap real encontrado integrando un cliente externo (RestroCloud, vía API key): `POST /emisor` y `POST /emisor/:cedula/certificado` exigían `Permiso.GestionarEmisores`, permiso admin-only — pero una API key **nunca** puede tener `rol: admin` por diseño (`apiKeyService`: "Una API key nunca es admin: solo emite o lee"), así que ninguna integración externa podía completar su propio onboarding, aunque el admin que creó esa key ya la hubiera scoped explícitamente a esa cédula. Corregido con una nueva guarda `puedeGestionarEmisor` (`src/routes/_guards.ts`): permite a un humano con `GestionarEmisores` (sin cambio), o a una API key con `Permiso.Emitir` (rol `facturador`, nunca `lector`) cuya lista `emisores` incluya esa cédula (o esté vacía = sin restricción) — deliberadamente **no** amplía lo que una API key puede hacer más allá de los emisores que su propio creador ya le autorizó. Ambas rutas pasan de `preHandler: app.requierePermiso(...)` a `preHandler: app.authenticate` + el chequeo explícito dentro del handler (la cédula viene del body en una ruta y de la URL en la otra). 6 tests nuevos en `src/routes/_guards.test.ts` (admin ✅, facturador/lector humanos ❌, API key facturador scoped ✅, API key scoped a otra cédula ❌, API key sin restricción ✅, API key `lector` scoped ❌ — este último caso fue un bug real de la primera versión del fix, encontrado por prueba negativa en vivo, no solo por inspección). Verificado también con `curl` de punta a punta: API key `facturador` scoped subiendo un certificado real (200), la misma API key con rol `lector` rechazada (403), y una API key de OTRO tenant rechazada contra este emisor (403). 174/174 tests en verde. |

## C. Clientes / Receptores

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| C1 | Autocompletar receptor | Guarda cada receptor usado en una factura (por tenant + número de identificación) para autocompletar en la siguiente emisión. | ✅ Implementado | Modelo `Cliente` en `prisma/schema.prisma`, `GET /clientes`, `GET /clientes/:numero` en `src/routes/emisor.ts:119`. |

## D. Emisión de Comprobantes Electrónicos

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| D1 | Clave y consecutivo | Genera la clave numérica de 50 dígitos y el consecutivo de 20. | ✅ Implementado | `src/domain/clave/clave.ts`, `POST /clave`. |
| D2 | XML v4.4 | Genera el XML para los 5 tipos de comprobante (factura, tiquete, NC, ND, mensaje receptor). | ✅ Implementado | `src/domain/factura/facturaXml.ts`, `src/domain/mensajeReceptor/mensajeReceptor.ts`. |
| D3 | Validación de negocio previa | Reglas que fallan antes de contactar a Hacienda: formatos, receptor obligatorio (salvo tiquete), plazo de crédito, tipo de cambio, CABYS de 13 dígitos, tarifas 0–100, referencias en notas. | ✅ Implementado | `src/domain/validacion/validacion.ts`. |
| D4 | Firma XAdES | Firma enveloped XAdES-BES, o XAdES-EPES si hay política de firma configurada. | ✅ Implementado | (2026-07-31) `HACIENDA_POLICY_URL`/`HACIENDA_POLICY_HASH` configurados con el dato **oficial real**, confirmado dos veces de forma independiente: (1) tomado literalmente del ejemplo de firma dentro de `ANEXOS_Y_ESTRUCTURAS_V4.4.pdf` (Hacienda, Anexo 1 v4.4); (2) el hash de ese ejemplo (`DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=`, SHA-256 estándar en base64 — no la variante hex-en-texto de ejemplos más viejos de v4.1 en SCIJ) coincide byte a byte con el SHA-256 calculado en vivo sobre el PDF real de la Resolución General MH-DGT-RES-0027-2024 descargado desde `hacienda.go.cr`. Verificado real contra Hacienda: un comprobante firmado en EPES con estos valores ya no recibe el rechazo "la firma del documento no tiene el Policy Id" que sí se obtenía con BES puro. |
| D5 | Envío y estado | Envía a recepción de Hacienda y consulta el estado (aceptado/rechazado/procesando) con polling. | ✅ Implementado | `src/services/hacienda/emision.ts`, `src/services/hacienda/reception.ts`. (2026-07-31) Probado también end-to-end contra el sandbox REAL de Hacienda (no solo el mock propio) — login real, envío real (HTTP 202 de recepción), y mensaje de estado real recibido y parseado — ver B6. |
| D6 | Listado/consulta de comprobantes | Lista comprobantes emitidos (filtrable) y consulta por clave. | ✅ Implementado | `GET /comprobantes`, `GET /comprobante/:clave` en `src/routes/comprobante.ts`. |
| D7 | Borradores | Guardar el estado del formulario de emisión (JSON) y reanudarlo antes de emitir. | ✅ Implementado | `src/services/borradores/borradorService.ts`, `/borradores/*`. |
| D8 | Validación contra XSD oficial | Validar el XML generado contra el esquema XSD v4.4 publicado por Hacienda. | ⬜ Pendiente | Hoy solo se valida la lógica de negocio (D3), no la estructura XML contra el esquema oficial (no hay un validador XSD local — los 2 gaps de D11 se encontraron por rechazo real de Hacienda, no por validación estática propia). |
| D9 | Gestión de consecutivos por emisor | Autogenerar y controlar el consecutivo de cada emisor/tipo de documento en el servidor. | ✅ Implementado | (2026-07-30) Nuevo modelo `ConsecutivoContador` (`@@id([cedulaEmisor, sucursal, terminal, tipo])`) + `ConsecutivoRepository` (`src/infra/repos/types.ts`, implementado en `memory.ts` y `prisma.ts` — patrón dual ya establecido). `datosFacturaSchema.consecutivo` (`src/routes/factura.ts`) pasa a **opcional**: si se omite, `/comprobante/:tipo/enviar` lo asigna atómicamente antes de emitir (`consecutivoRepository.siguiente`, `upsert` con `increment` en Prisma — atómico a nivel de fila bajo concurrencia real; `Map` con incremento síncrono en memoria); si el cliente lo manda explícito (compatibilidad hacia atrás, `/factura/xml` sigue exigiéndolo ya que no persiste nada ni tiene emisor real del que resolverlo), se respeta y además avanza el contador interno (`registrarSiUsado`, nunca retrocede) para que una asignación automática futura nunca colisione con él. Motivado por un cliente externo real (RestroCloud, vía API key) con múltiples sucursales/cajeros emitiendo en paralelo bajo el mismo emisor. Verificado con tests nuevos en `memory.test.ts` (incl. 5 asignaciones "concurrentes" vía `Promise.all` sin colisión) — 168/168 tests en verde, `tsc` limpio. |

| D10 | Exoneración de impuestos por línea | Marcar un impuesto de una línea como exonerado (total/parcial) con documento de autorización, institución, fecha, porcentaje y monto — reduce el monto de ESE impuesto, no el total del comprobante. | ✅ Implementado | (2026-07-30) Gap real encontrado leyendo el código durante una integración externa (RestroCloud, que ya tiene exoneración real en producción a nivel de factura — sin esto no había paridad) — no estaba en este tracker. Nueva interfaz `Exoneracion` en `domain/factura/types.ts` (campo opcional `exoneracion?` en `Impuesto`); `totales.ts` resta `montoExoneracion` del monto bruto del impuesto (nunca negativo); `facturaXml.ts` agrega el nodo `<Exoneracion>` dentro de `<Impuesto>` (después de `Tarifa`, antes de `Monto` — ⚠️ orden/nombres pendientes de validar contra el XSD oficial, mismo disclaimer que D8); `validacion.ts` exige `numeroDocumento`/`nombreInstitucion`/`fechaEmisionDocumento`, `porcentajeExoneracion` 1–100, y que `montoExoneracion` no supere el impuesto bruto. **Bug real encontrado en vivo, no solo en tests unitarios**: el schema de Zod de `routes/factura.ts` (`lineaSchema`) no incluía `exoneracion` en cada impuesto — Fastify la descartaba silenciosamente antes de llegar al dominio, así que la exoneración nunca habría llegado a aplicarse vía HTTP real (los tests unitarios llaman las funciones de dominio directo, sin pasar por Zod, por eso no lo detectaron) — corregido agregando `exoneracionSchema` al array de `impuestos`, reverificado con `curl` contra un servidor real (puerto 3099, para no chocar con otro servicio ya corriendo en 3000) confirmando el nodo `<Exoneracion>` y el `<Monto>` neto correctos. Tests nuevos en `totales.test.ts`/`facturaXml.test.ts`/`validacion.test.ts`. |
| D11 | Campos de encabezado/línea v4.4 faltantes en el generador de XML | Dos elementos obligatorios de la estructura v4.4 que el generador aún no emitía. | ✅ Implementado | (2026-07-31) Encontrados por rechazo REAL de Hacienda durante la primera prueba de punta a punta contra el sandbox real (no por inspección del XSD, que sigue sin validarse localmente, ver D8): (1) `ProveedorSistemas` (cédula del proveedor de sistemas de facturación) faltaba por completo en el encabezado — obligatorio para los 7 tipos de comprobante según el Anexo 1 v4.4; agregado en `domain/factura/types.ts` (`FacturaInput.proveedorSistemas?`) y emitido en `facturaXml.ts` justo entre `<Clave>` y `<CodigoActividadEmisor>` (la posición exacta que exigió el primer rechazo), con default a la cédula del propio emisor si se omite — cubre el caso "desarrollo propio o comprado a la medida" que la propia Resolución General contempla explícitamente, sin forzar a inventar un tercero cuando no lo hay. (2) `ImpuestoAsumidoEmisorFabrica` faltaba a nivel de línea, entre el/los nodos `Impuesto` y `ImpuestoNeto` — obligatorio incluso cuando no aplica (valor "0"), según el Anexo 1; agregado en `facturaXml.ts` con valor fijo `0` ya que este dominio no modela regalías/bonificaciones ni impuestos específicos cobrados a nivel de fábrica. Ambos añadidos también al schema de Zod de `datosFacturaSchema` (`proveedorSistemas` opcional). 174/174 tests en verde tras el cambio (ninguno de los tests existentes fijaba el orden/conteo exacto de nodos, así que no hubo que tocarlos), `tsc` limpio. Verificado real: el mismo comprobante de prueba pasó de un rechazo de schema (`cvc-complex-type.2.4.a`, nodo inesperado) a ser aceptado estructuralmente por Hacienda — los rechazos restantes ya son 100% de datos de negocio (ubicación/actividad económica no registradas para la cédula de prueba, CABYS de prueba inventado), no de la estructura del XML. |
| D12 | Idempotencia en la emisión (`referenciaExterna`) | `POST /comprobante/:tipo/enviar` no tenía ninguna forma de saber "ya procesé esto antes" — cada llamada consumía un consecutivo nuevo y creaba un comprobante nuevo, aunque fuera un reintento de la misma solicitud. | ✅ Implementado | (2026-08-01) Gap real encontrado planificando la reconciliación de facturas atascadas en RestroCloud (su cliente externo vía API key): si su proceso muere justo después de que Factu ya creó el documento real pero antes de guardar la clave, un simple "reintentar" habría duplicado un comprobante fiscal real. Nueva columna opcional `Comprobante.referenciaExterna` (`prisma/schema.prisma`, `@@unique([cedulaEmisor, referenciaExterna])` — NULL no colisiona con NULL en Postgres, así que un cliente que no manda esta clave no se ve afectado) + `referenciaExterna` opcional en `datosFacturaSchema` (`src/routes/factura.ts`, sin efecto en `/factura/xml`, que no persiste nada) + `buscarPorReferencia(cedulaEmisor, referenciaExterna)` en `ComprobanteRepository` (`types.ts`/`memory.ts`/`prisma.ts`). `POST /comprobante/:tipo/enviar` (`src/routes/comprobante.ts`), justo después del guard `emisorDelTenant` y antes de resolver el consecutivo (D9): si viene `referenciaExterna` y ya existe un comprobante con esa `(cedulaEmisor, referenciaExterna)`, devuelve ese mismo registro tal cual (`idempotente: true` en la respuesta) — sin consumir un consecutivo nuevo, sin volver a llamar a Hacienda, sin repetir la entrega por correo/webhooks (ya corrieron la primera vez). Nuevo test en `memory.test.ts` (aislamiento correcto entre emisores con la misma referencia). Verificado en vivo contra el servidor real (emisor 207820791 ya registrado, API key real): insertar un comprobante con `referenciaExterna` conocida y volver a llamar `/comprobante/tiquete/enviar` con esa misma referencia devolvió el mismo documento (`idempotente: true`, mismo `clave`/`estado`) sin crear una fila nueva y sin tocar `ConsecutivoContador`; una llamada sin `referenciaExterna` (o con una que no coincide) siguió comportándose exactamente igual que antes (falla por falta de sesión real de Hacienda, el mismo error ya documentado, no una regresión). 175/175 tests en verde, `tsc` limpio. |

## E. Documentos Recibidos / Mensaje Receptor

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| E1 | Carga manual de documento recibido | Registrar manualmente un comprobante que la empresa recibió (XML + metadatos). | ✅ Implementado | `POST /recibidos`, `src/services/documentosRecibidos/documentosRecibidosService.ts`. |
| E2 | Recepción automática por correo | Buzón IMAP configurable por tenant; poller que extrae los XML adjuntos/entrantes. | ✅ Implementado | `src/services/correo/correoService.ts`, `src/services/correo/poller.ts`, `/correo/*`. |
| E3 | Generar Mensaje Receptor | A partir de un documento recibido, genera la respuesta de aceptación/rechazo/aceptación parcial. | ✅ Implementado | `POST /recibidos/:id/mensaje-receptor`, `POST /mensaje-receptor/xml`. |
| E4 | Listado/consulta de recibidos | Lista y consulta documentos recibidos, filtra por emisor/receptor. | ✅ Implementado | `GET /recibidos`, `GET /recibidos/:id`. |

## F. Entrega al Cliente

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| F1 | SMTP saliente configurable | Configuración de correo saliente por tenant (host, puerto, TLS/STARTTLS, remitente). | ✅ Implementado | `src/services/entrega/smtpConfigService.ts`, `/correo-salida/*`. |
| F2 | PDF del comprobante | Genera el PDF (representación impresa) del comprobante emitido. | ✅ Implementado | `src/services/entrega/comprobantePdf.ts` (pdfkit). (2026-07-31) Gap real encontrado integrando un cliente externo (RestroCloud): hasta ahora el PDF solo se podía *enviar* por correo (`/reenviar`), nunca *descargar* directamente — sin correo del receptor, o si el cliente externo quiere mostrar/descargar el documento en su propia UI sin depender del correo, no había forma. Nuevo `GET /comprobante/:clave/pdf` (mismo guard que `GET /comprobante/:clave`) reusa `parsearParaPdf`+`generarFacturaPdf` sin duplicar nada, y devuelve `{clave, filename, pdfBase64}` — base64 en vez de bytes crudos para no requerir manejo binario nuevo en clientes que ya asumen JSON. |
| F3 | Envío al cliente + reintentos | Envía el comprobante (XML + PDF) por correo al receptor, con cola de reintentos. | ✅ Implementado | `src/services/entrega/entregaService.ts`, `src/services/entrega/poller.ts`. |
| F4 | Historial y reenvío | Historial de envíos por comprobante (auditable) y reenvío manual. | ✅ Implementado | `POST /comprobante/:clave/reenviar`, `GET /comprobante/:clave/envios`. |

## G. Estadísticas

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| G1 | Resumen general | Totales agregados (emitidos, aceptados, rechazados, montos). | ✅ Implementado | `GET /estadisticas/resumen`. |
| G2 | Desglose por emisor | Estadísticas agrupadas por emisor del tenant. | ✅ Implementado | `GET /estadisticas/emisores`. |
| G3 | Serie temporal | Serie de emisión en el tiempo (para gráficos). | ✅ Implementado | `GET /estadisticas/serie`. |

## H. Webhooks (integraciones salientes)

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| H1 | CRUD de webhooks | Alta/edición/baja de endpoints suscritos a eventos (ej. `comprobante.aceptado`). | ✅ Implementado | `src/routes/webhooks.ts`, `src/services/webhooks/webhookService.ts`. |
| H2 | Firma HMAC | El payload saliente se firma con el secreto configurado del webhook. | ✅ Implementado | Secreto cifrado en reposo (`secretSellado`), firmado al entregar. |
| H3 | Prueba y reintentos | Disparo manual de prueba y reintentos con historial de entregas. | ✅ Implementado | `POST /webhooks/:id/probar`, `GET /webhooks/:id/entregas`, `src/services/webhooks/poller.ts`. |

## I. Notificaciones

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| I1 | Canales soportados | SMS (Twilio), WhatsApp Cloud, Slack, Teams, Bitrix24. | ✅ Implementado | `src/services/notificaciones/providers/*`, patrón Strategy (`NotificationProvider`). |
| I2 | CRUD de canales + prueba | Alta/edición/baja de canal con config cifrada, suscripción a eventos, envío de prueba. | ✅ Implementado | `src/routes/notificaciones.ts`. |
| I3 | Historial y reintentos | Cola de mensajes con reintentos y backoff, historial por canal. | ✅ Implementado | `src/services/notificaciones/retryPolicy.ts`, `src/services/notificaciones/poller.ts`. |

## J. Auditoría y Observabilidad

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| J1 | Registro de auditoría | Acciones de negocio atribuibles a un usuario/API key (login, emitir, crear webhook, etc.). | ✅ Implementado | `src/services/auditoria/index.ts`, `GET /auditoria` (solo admin). |
| J2 | Logs técnicos | Registro de eventos del sistema (pollers, entregas, errores no controlados) con nivel y origen. | ✅ Implementado | `src/services/logs/index.ts`, `GET /logs` (solo admin), hook `onError` en `src/server.ts`. |

## K. Colaboración interna

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| K1 | Chat interno | Mensajería 1:1 entre usuarios del mismo tenant, contactos, contador de no leídos. | ✅ Implementado | `src/services/chat/chatService.ts`, `/chat/*`. |

## L. Plataforma / Panel interno de Savegre (Savegre Center)

Superficie cross-tenant, separada por completo del modelo de auth por tenant
(sección A) — pedido explícito (2026-08-25) para que **Savegre Center**
(proyecto nuevo, panel interno de Savegre Soft que administra RestroCloud +
Factu + Wapi desde un solo lugar) pueda ver/gestionar clientes de Factu igual
que ya lo hace con RestroCloud (`RestauCloud-API` → `/api/platform/*`).
Decisión de alcance tomada en conversación: paridad completa de ciclo de
suscripción (no un motor de módulos — Factu es un producto único), y una
credencial de servicio **global** nueva, deliberadamente separada de `ApiKey`
(que sigue scoped a un tenant, para integraciones de facturación).

| ID | Requerimiento | Descripción | Estado | Notas |
|---|---|---|---|---|
| L1 | Credencial de plataforma | Credencial global (`platform_<keyId>.<secret>`, sin `tenantId`), generada solo por script (`scripts/crear-credencial-plataforma.ts`, no hay endpoint HTTP de creación). | ✅ Implementado | `src/services/plataforma/credencialPlataformaService.ts`. Prefijo elegido (`platform_`) deliberadamente sin solapamiento con `factu_` (prefijo de `ApiKey`) — un primer intento usó `factu_plat_`, que sí solapaba y hacía que `app.authenticate` intentara resolverla como `ApiKey` antes de fallar (rechazo seguro pero por la razón equivocada); corregido antes de verificar en vivo. |
| L2 | Guarda `requierePlataforma` | Decorator de Fastify completamente separado de `authenticate`/`requierePermiso`; deja el principal en `request.plataforma` (nunca en `request.user`). | ✅ Implementado | `src/plugins/auth.ts`. Verificado en vivo (servidor real, Postgres real, ver abajo) y ahora también con una suite E2E automatizada (`e2e/plataforma.spec.ts`, Playwright): una credencial de plataforma contra `GET /auditoria` (ruta de tenant) → 401; `GET /plataforma/tenants` sin token, o con un Bearer con prefijo `factu_` → 401. |
| L3 | Listado y detalle de tenants | `GET /plataforma/tenants` (id, nombre, conteo de usuarios/emisores, plan+estado de suscripción) y `GET /plataforma/tenants/:id` (+ `estadisticasService.resumen` + historial de pagos). | ✅ Implementado | `src/routes/plataforma.ts`. Requirió agregar `TenantRepository.listarTodos()` (no existía — solo `crear`/`buscar`), implementado en `memory.ts` y `prisma.ts`. |
| L4 | Suscripción por tenant | Plan, estado (`activa`/`suspendida`/`cancelada`), moneda, ciclo, descuento, fechas, notas — 1:1 con `Tenant`. Un tenant sin fila se trata como `activa` (mismo criterio que ya usa el panel equivalente de RestroCloud). | ✅ Implementado | Modelo `Suscripcion` (`prisma/schema.prisma`), `SuscripcionService.obtener/actualizar` (`src/services/plataforma/suscripcionService.ts`). `GET/PUT /plataforma/tenants/:id/suscripcion`. |
| L5 | Historial de cobros | Registrar y listar pagos de la suscripción de un tenant (monto, moneda, método, referencia, notas, quién lo registró). | ✅ Implementado | Modelo `PagoSuscripcion`. `registrarPago` materializa una suscripción por defecto si el tenant no tenía fila propia (para poder asociarle el pago). `GET/POST /plataforma/tenants/:id/suscripcion/pagos`. |
| L6 | Resumen agregado | Conteos cross-tenant (tenants por estado, total usuarios/emisores) para el futuro dashboard de Center. | ✅ Implementado | `GET /plataforma/summary`. |
| L7 | Auditoría de cambios de plataforma | Cada actualización de suscripción/pago queda en `RegistroAuditoria` con `actorTipo: "plataforma"` y el label de la credencial como nombre del actor. | ✅ Implementado | `ActorTipo` extendido (`"usuario" \| "apikey" \| "sistema" \| "plataforma"`), `actorDesde()` en `src/services/auditoria/index.ts` con rama nueva para `kind: "plataforma"`. |
| L8 | Suite E2E de `/plataforma/*` | Pedido explícito del usuario (2026-08-26) antes de commitear: automatizar lo verificado a mano con curl, con pruebas reales de extremo a extremo (no mocks). | ✅ Implementado | `e2e/plataforma.spec.ts` + `playwright.config.ts` — **primer uso de Playwright en Factu y en todo el ecosistema Savegre**. Corre en modo `request` (sin navegador, Factu no tiene UI): levanta `buildServer()` EN PROCESO con `PERSISTENCIA=memoria` (hermético, sin depender de Postgres), crea un tenant y una credencial de plataforma directamente vía los servicios, y llama la API real por HTTP. 7/7 tests verdes: listado/detalle de tenant, actualizar suscripción, registrar y listar pagos, 404 de tenant inexistente, y las 3 guardas cruzadas (L2). Encontró y corrigió un bug real del propio test (fecha `"2026-01-01"` sin hora violaba el `format: date-time` del schema — el 400 de validación de Fastify corre antes que el handler, así que llegaba antes que el 404 esperado; no es un bug de la ruta). Requirió agregar `vitest.config.ts` (no existía) para excluir `e2e/**` de Vitest — sin eso, Vitest intentaba correr el spec de Playwright directamente y fallaba en la recolección (`test.beforeAll() did not expect...`). `npm run test:e2e` en `package.json`. |

**Verificado en vivo (2026-08-26)**: levantado el servidor real (`PERSISTENCIA=prisma`,
puerto 3099) contra el Postgres real del `docker-compose` de este repo (contenedor
`factu-db-1`, que ya tenía datos reales de trabajo previo — 1 tenant, 1 usuario, 1
comprobante; se usó `prisma db push`, no `migrate dev`, para no arriesgar esos datos
al no existir carpeta `prisma/migrations` local). Con una credencial creada por el
script: `GET /plataforma/tenants` y `/summary` devolvieron el tenant real
("RestroCloud Demo Persistente"); `PUT .../suscripcion` cambió su plan a "pro";
`POST .../pagos` registró un cobro real (`SINPE-123`, ₡50000) que apareció en el
`GET` subsiguiente; las 3 guardas cruzadas (credencial de plataforma contra
`/auditoria`, sin token, y un Bearer con prefijo `factu_` contra `/plataforma/tenants`)
devolvieron 401 como se esperaba. Swagger (`/swagger/json`) expone las 5 rutas bajo
el tag "Plataforma". **Nota**: la credencial usada para verificar (id
`9b77ceab-384f-4504-b81c-5fe7f4856f36`) y el pago de prueba (`SINPE-123`) quedaron
en la base — el pago es sobre el tenant demo ya existente (no un cliente real), pero
conviene revocar esa credencial de verificación antes de usar esta base para nada
más serio, y generar una nueva para el uso real de Savegre Center.

**Pendiente para Savegre Center** (fuera del alcance de este trabajo en Factu):
construir el adaptador que consuma estos endpoints desde el backend de Center.

---

## Orden de trabajo sugerido

Prioridad por dependencia real de datos/acceso, no alfabética:

1. **B6 — Confirmar credenciales/URLs oficiales de Hacienda (IDP + recepción, stag y prod).**
   Es la dependencia raíz: sin esto no se puede probar D5 (envío/estado) contra el sandbox
   real, ni tiene sentido configurar D4 (política EPES) con datos reales.
2. **D4 — Cargar `HACIENDA_POLICY_URL`/`HACIENDA_POLICY_HASH` oficiales (XAdES-EPES).**
   Depende de tener acceso oficial (paso 1). El código ya soporta EPES; solo falta el dato.
3. **D8 — Validación contra el XSD oficial v4.4.**
   No depende de credenciales de Hacienda — se puede desarrollar en paralelo con el XSD
   público, pero conviene antes de las pruebas end-to-end reales para no gastar intentos
   contra el sandbox con XML mal formado.

**D9 (consecutivos atómicos), D10 (exoneración por línea) y D11 (campos v4.4 faltantes) ya están ✅ implementados (2026-07-30/31)** —
priorizados fuera de este orden porque los pidió un cliente externo real (RestroCloud, vía
API key de servicio) con necesidad inmediata de ambos antes de integrar en serio.

## Notas generales

- **Persistencia dual**: todo el dominio corre igual sobre backend en memoria
  (`PERSISTENCIA=memoria`, para desarrollo/tests) o Prisma/PostgreSQL
  (`PERSISTENCIA=prisma`). Cualquier feature nueva debe implementarse en ambos repos
  (`src/infra/repos/memory.ts` y `src/infra/repos/prisma.ts`) para no romper los tests
  unitarios que corren en memoria.
- **Secretos cifrados en reposo**: `.p12`, contraseñas SMTP/IMAP, secretos de webhook y
  config de canales de notificación se guardan como `SecretoSellado` (JSON cifrado
  AES-256-GCM con `FACTU_MASTER_KEY`). Nunca se devuelven en claro por la API.
- **`FACTU_MASTER_KEY` y `JWT_SECRET`** tienen valores inseguros por defecto solo en
  desarrollo; en producción son obligatorios (el arranque falla si faltan).
- El dominio (`src/domain/`) es lógica pura sin infraestructura — 100% testeable sin red
  ni certificados reales; los servicios (`src/services/`) inyectan sus dependencias.
