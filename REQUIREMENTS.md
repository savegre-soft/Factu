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
