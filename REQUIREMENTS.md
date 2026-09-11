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
| B5 | Certificado real vs. demo | Si el emisor no tiene `.p12` cargado, firma con uno autofirmado de prueba y lo marca (`certificadoDemo: true`) — Hacienda solo acepta el real. | ✅ Implementado | Comportamiento intencional para desarrollo, documentado en `docs/conexion-hacienda.md`. Aplica a `/comprobante/:tipo/enviar`; el REP (D12) exige certificado real. |
| B6 | Credenciales oficiales de producción | URLs oficiales del IDP/recepción de Hacienda (stag y prod) confirmadas y probadas contra el sandbox real. | 🟡 Parcial | Las URLs y el `client_id` de ambos ambientes ya viven en el código, derivados de `HACIENDA_ENV` (`src/config/hacienda.ts`: realm `rut-stag` + `api-sandbox` para pruebas, realm `rut` + `api` para producción), y se pueden sobrescribir con `HACIENDA_IDP_URL`/`HACIENDA_API_URL`/`HACIENDA_CLIENT_ID`. **Confirmadas en vivo dos veces, en fechas distintas**: (2026-07-31) login real contra el IDP con credenciales reales de un contribuyente físico de sandbox (`usuario cpf-02-...@stag.comprobanteselectronicos.go.cr`) devolvió un access/refresh token real (200), y un tiquete de prueba emitido con su certificado `.p12` real llegó realmente a recepción (HTTP 202, clave/consecutivo reales) — el rechazo final fue por datos de negocio inventados en la prueba (ubicación/actividad económica no registradas para esa cédula), no por la URL/IDP; (2026-08-09) Hacienda además **aceptó** una factura completa emitida contra su sandbox real, con certificado y credenciales reales (consecutivo `00100001010000000002`, emisor `207820791`). Ambas confirman el IDP, la recepción y el `client_id` de pruebas. Sigue 🟡 y no ✅ porque las URLs de **prod** no se han probado (no hay credenciales de producción disponibles) y falta decidir cómo RestroCloud conseguirá/gestionará credenciales reales de cada cliente para ir a producción — eso es trabajo de producto, no técnico. |
| B7 | Sesiones de Hacienda persistidas | Los tokens del IDP sobreviven a un reinicio de la API, cifrados en reposo. | ✅ Implementado | Modelo `SesionHacienda` + `src/services/auth/almacenSesiones.ts` (`AlmacenSesionesCifrado`). El `TokenStore` mantiene el caché en memoria y este almacén es su respaldo: el `TokenSet` se sella con la llave maestra igual que un `.p12`. Un refresh vencido, o un dato que no se puede descifrar (llave rotada sin recifrar), se descarta y obliga a iniciar sesión de nuevo en vez de romper la emisión. |
| B8 | API keys de servicio pueden gestionar su propio emisor | Una API key `facturador` ya scoped a una cédula puede registrar/actualizar ese emisor y subir su certificado `.p12`, sin necesitar credenciales de un usuario humano admin. | ✅ Implementado | (2026-07-30) Gap real encontrado integrando un cliente externo (RestroCloud, vía API key): `POST /emisor` y `POST /emisor/:cedula/certificado` exigían `Permiso.GestionarEmisores`, permiso admin-only — pero una API key **nunca** puede tener `rol: admin` por diseño (`apiKeyService`: "Una API key nunca es admin: solo emite o lee"), así que ninguna integración externa podía completar su propio onboarding, aunque el admin que creó esa key ya la hubiera scoped explícitamente a esa cédula. Corregido con una nueva guarda `puedeGestionarEmisor` (`src/routes/_guards.ts`): permite a un humano con `GestionarEmisores` (sin cambio), o a una API key con `Permiso.Emitir` (rol `facturador`, nunca `lector`) cuya lista `emisores` incluya esa cédula (o esté vacía = sin restricción) — deliberadamente **no** amplía lo que una API key puede hacer más allá de los emisores que su propio creador ya le autorizó. Ambas rutas pasan de `preHandler: app.requierePermiso(...)` a `preHandler: app.authenticate` + el chequeo explícito dentro del handler (la cédula viene del body en una ruta y de la URL en la otra). 6 tests nuevos en `src/routes/_guards.test.ts` (admin ✅, facturador/lector humanos ❌, API key facturador scoped ✅, API key scoped a otra cédula ❌, API key sin restricción ✅, API key `lector` scoped ❌ — este último caso fue un bug real de la primera versión del fix, encontrado por prueba negativa en vivo, no solo por inspección). Verificado también con `curl` de punta a punta: API key `facturador` scoped subiendo un certificado real (200), la misma API key con rol `lector` rechazada (403), y una API key de OTRO tenant rechazada contra este emisor (403). |

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
| D4 | Firma XAdES | Firma enveloped XAdES-BES, o XAdES-EPES si hay política de firma configurada. | ✅ Implementado | `src/services/firma/xadesSigner.ts`. (2026-07-31) `HACIENDA_POLICY_URL`/`HACIENDA_POLICY_HASH` configurados con el dato **oficial real**, confirmado dos veces de forma independiente: (1) tomado literalmente del ejemplo de firma dentro de `ANEXOS_Y_ESTRUCTURAS_V4.4.pdf` (Hacienda, Anexo 1 v4.4); (2) el hash de ese ejemplo (`DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=`, SHA-256 estándar en base64 — no la variante hex-en-texto de ejemplos más viejos de v4.1 en SCIJ) coincide byte a byte con el SHA-256 calculado en vivo sobre el PDF real de la Resolución General MH-DGT-RES-0027-2024 descargado desde `hacienda.go.cr`. Verificado real contra Hacienda: un comprobante firmado en EPES con estos valores ya no recibe el rechazo "la firma del documento no tiene el Policy Id" que sí se obtenía con BES puro. **Confirmar que la resolución referenciada sigue siendo la vigente antes de producción.** |
| D5 | Envío y estado | Envía a recepción de Hacienda y consulta el estado (aceptado/rechazado/procesando) con polling. | ✅ Implementado | `src/services/hacienda/emision.ts`, `reception.ts`, `envelope.ts` (sobre JSON con el XML en base64). Probado end-to-end contra el sandbox REAL de Hacienda dos veces: (2026-07-31) login real, envío real (HTTP 202) y mensaje de estado real parseado (ver B6); (2026-08-09) una factura completa aceptada. Falta ejercitar los demás tipos y variantes (ver D14). |
| D6 | Listado/consulta de comprobantes | Lista comprobantes emitidos (filtrable, paginado) y consulta por clave. | ✅ Implementado | `GET /comprobantes`, `GET /comprobante/:clave` en `src/routes/comprobante.ts`. El listado usa `ComprobanteResumen` (sin `xmlFirmado` ni `respuestaXml`, ~13 KB cada uno): traerlos convertía cualquier listado en una descarga de decenas de MB. Paginación común en `src/routes/_pagina.ts` (50 por defecto, 200 máximo). |
| D7 | Borradores | Guardar el estado del formulario de emisión (JSON) y reanudarlo antes de emitir. | ✅ Implementado | `src/services/borradores/borradorService.ts`, `/borradores/*`. |
| D8 | Validación contra XSD oficial | Validar **en tiempo de ejecución** el XML generado contra el esquema XSD v4.4 de Hacienda. | ⬜ Pendiente | El generador se contrastó **a mano, nodo por nodo**, contra los cuatro XSD oficiales (`FacturaElectronica`, `ReciboElectronicoPago`, `FacturaElectronicaCompra`, `FacturaElectronicaExportacion`), lo que destapó seis defectos reales que Hacienda habría rechazado (ver D15). Lo que sigue pendiente es la validación **automática** en cada emisión, que atraparía una regresión futura sin depender de que alguien vuelva a leer el esquema. |
| D9 | Gestión de consecutivos por emisor | Autogenerar y controlar el consecutivo de cada emisor/tipo de documento en el servidor. | ✅ Implementado | (2026-07-30) Nuevo modelo `ConsecutivoContador` (`@@id([cedulaEmisor, sucursal, terminal, tipo])`) + `ConsecutivoRepository` (`src/infra/repos/types.ts`, implementado en `memory.ts` y `prisma.ts` — patrón dual ya establecido). `datosFacturaSchema.consecutivo` (`src/routes/factura.ts`) pasa a **opcional**: si se omite, `/comprobante/:tipo/enviar` lo asigna atómicamente antes de emitir (`consecutivoRepository.siguiente`, `upsert` con `increment` en Prisma — atómico a nivel de fila bajo concurrencia real; `Map` con incremento síncrono en memoria); si el cliente lo manda explícito (compatibilidad hacia atrás, `/factura/xml` sigue exigiéndolo ya que no persiste nada ni tiene emisor real del que resolverlo), se respeta y además avanza el contador interno (`registrarSiUsado`, nunca retrocede) para que una asignación automática futura nunca colisione con él. Motivado por un cliente externo real (RestroCloud, vía API key) con múltiples sucursales/cajeros emitiendo en paralelo bajo el mismo emisor. **Convive con el mecanismo previo** (modelo `ConsecutivoEmisor` + `reservarConsecutivo()`/`proximoConsecutivo()`/`liberarConsecutivo()` en `ComprobanteRepository`, serie = cédula+sucursal+terminal+tipo, con devolución del número a la serie si la emisión falla antes de llegar a Hacienda): ese mecanismo más viejo ya NO lo usa `/comprobante/:tipo/enviar` (migrado a `ConsecutivoRepository`), pero sigue siendo el único que usa `/recibo-pago/enviar` (D12, serie propia `"REP"`), que todavía no se migró. `GET /comprobante/proximo-consecutivo` sigue leyendo del contador viejo (es solo una vista previa del formulario, sin consumir nada — puede quedar desincronizado del contador atómico real, aceptable por ser solo informativo). Verificado con tests nuevos en `memory.test.ts` (incl. 5 asignaciones "concurrentes" vía `Promise.all` sin colisión). |
| D10 | Exoneración de impuestos por línea | Marcar un impuesto de una línea como exonerado (total/parcial) con documento de autorización, institución, fecha y porcentaje — reduce el monto de ESE impuesto, no el total del comprobante. | ✅ Implementado | (2026-07-30) Gap real encontrado leyendo el código durante una integración externa (RestroCloud, que ya tiene exoneración real en producción a nivel de factura — sin esto no había paridad) — no estaba en este tracker. `Exoneracion` en `src/domain/factura/types.ts` con el catálogo completo de 12 tipos (`TipoExoneracion`) y los campos que exige el XSD (`articulo`/`inciso` opcionales, `tarifaExonerada`); campo opcional `exoneracion?` en `Impuesto`. `totales.ts` calcula el monto exonerado como `subTotal × tarifaExonerada/100` y lo resta del bruto del impuesto (nunca negativo, se satura en 0 si la tarifa exonerada excede la tarifa real). `facturaXml.ts` agrega el nodo `<Exoneracion>` dentro de `<Impuesto>` en el orden exacto del XSD (`TipoDocumentoEX1 → TipoDocumentoOTRO? → NumeroDocumento → Articulo? → Inciso? → NombreInstitucion → NombreInstitucionOtros? → FechaEmisionEX → TarifaExonerada → MontoExoneracion`) — el `Monto` del impuesto sigue siendo el **bruto**, la rebaja va en `MontoExoneracion` del nodo `Exoneracion`. `validacion.ts` exige `numeroDocumento`/`nombreInstitucion`/`fechaEmision` y `tarifaExonerada` entre 1 y 100. **Bug real encontrado en vivo, no solo en tests unitarios**: el schema de Zod de `routes/factura.ts` (`lineaSchema`) no incluía `exoneracion` en cada impuesto — Fastify la descartaba silenciosamente antes de llegar al dominio, así que la exoneración nunca habría llegado a aplicarse vía HTTP real (los tests unitarios llaman las funciones de dominio directo, sin pasar por Zod, por eso no lo detectaron) — corregido agregando el schema completo (con `TipoExoneracion`/`articulo`/`inciso`) al array de `impuestos`, reverificado con `curl` contra un servidor real confirmando el nodo `<Exoneracion>` y el `<Monto>` correctos. Tests en `totales.test.ts`/`facturaXml.test.ts`/`validacion.test.ts`. Cubre zonas francas, instituciones exoneradas y diplomáticos. |
| D11 | Factura de compra y de exportación | Tipos `FEC` (compra a un no inscrito) y `FEE` (exportación) en el mismo endpoint de emisión. | ✅ Implementado | `POST /comprobante/compra/enviar` y `/comprobante/exportacion/enviar`; mapeo en `RUTA_A_TIPO` (`src/routes/comprobante.ts:31`) y `TipoDocumento.FacturaCompra`/`FacturaExportacion` en `src/domain/factura/facturaXml.ts`. |
| D12 | Recibo Electrónico de Pago (REP) | Comprobante nuevo en v4.4: lo emite quien facturó a crédito cuando cobra. | ✅ Implementado | `POST /recibo-pago/enviar` (`src/routes/reciboPago.ts`) + `src/domain/reciboPago/reciboPagoXml.ts`. Sigue el mismo camino que una factura (clave → XML → firma → envío → estado) pero con estructura propia: emisor/receptor sin ubicación ni teléfono, sin código de actividad, y la línea sin CABYS ni cantidad (documenta un monto cobrado, no una venta). `InformacionReferencia` es **obligatoria** (la factura que se cobra) y `MedioPago` también. Tiene su propia serie de consecutivos (`tipo: "REP"`, vía el contador `ConsecutivoEmisor`/`reservarConsecutivo` — ver la nota de D9 sobre por qué este endpoint no migró al contador atómico D9). Se guarda en la tabla `Comprobante` para que aparezca en listados, estadísticas y re-consulta. Emite el evento `recibo-pago.<estado>` y auditoría `recibo-pago.emitir`. |
| D13 | Re-consulta de comprobantes sin veredicto | Volver a preguntar a Hacienda por los comprobantes que quedaron en «recibido»/«procesando». | ✅ Implementado | `src/services/hacienda/reconsulta.ts` + `pollerReconsulta.ts` (5.º poller, `RECONSULTA_ENABLED` / `RECONSULTA_MINUTOS`, 10 min por defecto). Durante la emisión el estado se espera ~15 s (5 intentos × 3 s); si Hacienda tardaba más, el comprobante se quedaba en «recibido» **para siempre** porque nadie volvía a preguntar. El barrido toma hasta 50 pendientes de los últimos 7 días, y al llegar el veredicto dispara los mismos efectos que habría disparado la emisión (webhook, notificación y entrega al cliente). Nunca lanza: un comprobante que falla no frena el resto ni tumba el poller; sin sesión del emisor se omite y se reintenta en el siguiente barrido. |
| D14 | Cobertura real de los tipos de comprobante | Haber emitido y visto aceptado cada tipo/variante contra Hacienda. | 🟡 Parcial | Aceptada una factura simple (2026-08-09). **Sin ejercitar todavía**: descuentos, líneas exentas, exoneración, nota de crédito, nota de débito, factura de compra, factura de exportación y REP. Todos están verificados contra el XSD y con tests, pero un rechazo por formato solo se descubre enviándolo. La aplicación web lleva la cuenta en su panel de ambiente, calculada a partir de los comprobantes aceptados. |
| D15 | Conformidad del XML con v4.4 | Que el XML generado respete el esquema en los puntos donde v4.4 cambió respecto de v4.3, o donde exige campos nuevos. | ✅ Implementado | Seis defectos reales encontrados y corregidos (que Hacienda habría rechazado), cuatro de ellos el 2026-08-09 leyendo el generador contra los cuatro XSD oficiales, dos más el 2026-07-31 por rechazo real de Hacienda durante la primera prueba end-to-end: **(1)** las líneas sin impuesto omitían `BaseImponible`, `Impuesto`, `ImpuestoAsumidoEmisorFabrica` e `ImpuestoNeto`, que en el XSD **no llevan `minOccurs="0"`** — una línea exenta se declara ahora con tarifa 0% y monto 0; **(2)** los descuentos no emitían `CodigoDescuento`, obligatorio en v4.4 (por defecto `07`, comercial); **(3)** las notas usaban los nombres de v4.3 `TipoDoc`/`FechaEmision` en vez de `TipoDocIR`/`FechaEmisionIR`, así que **ninguna nota pasaba el esquema**; **(4)** la fecha de la clave se calculaba con la hora local del proceso (UTC en el contenedor) mientras `FechaEmision` usaba el offset de Costa Rica, lo que desfasaba un día toda emisión posterior a las 18:00 CR; **(5)** `ProveedorSistemas` (cédula del proveedor de sistemas de facturación) faltaba por completo en el encabezado — obligatorio para los 7 tipos de comprobante según el Anexo 1 v4.4; agregado en `domain/factura/types.ts` (`FacturaInput.proveedorSistemas?`) y emitido en `facturaXml.ts` justo entre `<Clave>` y `<CodigoActividadEmisor>` (la posición exacta que exigió el rechazo), con default a la cédula del propio emisor si se omite — cubre el caso "desarrollo propio o comprado a la medida" que la propia Resolución General contempla explícitamente; **(6)** `ImpuestoAsumidoEmisorFabrica` faltaba a nivel de línea, entre el/los nodos `Impuesto` y `ImpuestoNeto` — obligatorio incluso cuando no aplica (valor "0"), según el Anexo 1. Ambos campos de (5)/(6) también en el schema de Zod (`proveedorSistemas` opcional). Verificado real: el mismo comprobante de prueba pasó de un rechazo de schema (`cvc-complex-type.2.4.a`, nodo inesperado) a ser aceptado estructuralmente por Hacienda — los rechazos restantes ya son 100% de datos de negocio (ubicación/actividad económica no registradas para la cédula de prueba, CABYS de prueba inventado), no de la estructura del XML. |
| D16 | Emisión en contingencia | Emitir marcando la situación cuando Hacienda no está disponible. | ✅ Implementado | `situacion` (1 normal, 2 contingencia, 3 sin internet) es un campo opcional de la emisión y viaja en la clave. El enum `SituacionComprobante` existía sin usarse: siempre se emitía como normal, así que una caída de Hacienda dejaba al contribuyente sin poder facturar. |
| D17 | Idempotencia en la emisión (`referenciaExterna`) | `POST /comprobante/:tipo/enviar` no tenía ninguna forma de saber "ya procesé esto antes" — cada llamada consumía un consecutivo nuevo y creaba un comprobante nuevo, aunque fuera un reintento de la misma solicitud. | ✅ Implementado | (2026-08-01) Gap real encontrado planificando la reconciliación de facturas atascadas en RestroCloud (su cliente externo vía API key): si su proceso muere justo después de que Factu ya creó el documento real pero antes de guardar la clave, un simple "reintentar" habría duplicado un comprobante fiscal real. Nueva columna opcional `Comprobante.referenciaExterna` (`prisma/schema.prisma`, `@@unique([cedulaEmisor, referenciaExterna])` — NULL no colisiona con NULL en Postgres, así que un cliente que no manda esta clave no se ve afectado) + `referenciaExterna` opcional en `datosFacturaSchema` (`src/routes/factura.ts`, sin efecto en `/factura/xml`, que no persiste nada) + `buscarPorReferencia(cedulaEmisor, referenciaExterna)` en `ComprobanteRepository` (`types.ts`/`memory.ts`/`prisma.ts`). `POST /comprobante/:tipo/enviar` (`src/routes/comprobante.ts`), justo después del guard `emisorDelTenant` y antes de resolver el consecutivo (D9): si viene `referenciaExterna` y ya existe un comprobante con esa `(cedulaEmisor, referenciaExterna)`, devuelve ese mismo registro tal cual (`idempotente: true` en la respuesta) — sin consumir un consecutivo nuevo, sin volver a llamar a Hacienda, sin repetir la entrega por correo/webhooks (ya corrieron la primera vez). Test en `memory.test.ts` (aislamiento correcto entre emisores con la misma referencia). Verificado en vivo contra el servidor real (emisor 207820791 ya registrado, API key real): insertar un comprobante con `referenciaExterna` conocida y volver a llamar `/comprobante/tiquete/enviar` con esa misma referencia devolvió el mismo documento (`idempotente: true`, mismo `clave`/`estado`) sin crear una fila nueva y sin tocar `ConsecutivoContador`; una llamada sin `referenciaExterna` (o con una que no coincide) siguió comportándose exactamente igual que antes. |

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
| F2 | PDF del comprobante | Genera el PDF (representación impresa) del comprobante emitido. | ✅ Implementado | `src/services/entrega/comprobantePdf.ts` (pdfkit). (2026-07-31) Gap real encontrado integrando un cliente externo (RestroCloud): hasta ahora el PDF solo se podía *enviar* por correo (`/reenviar`), nunca *descargar* directamente — sin correo del receptor, o si el cliente externo quiere mostrar/descargar el documento en su propia UI sin depender del correo, no había forma. Nuevo `GET /comprobante/:clave/pdf` (mismo guard que `GET /comprobante/:clave`) reusa `parsearParaPdf`+`generarFacturaPdf` sin duplicar nada, y devuelve `{clave, filename, pdfBase64}` — base64 en vez de bytes crudos para no requerir manejo binario nuevo en clientes que ya asumen JSON. |
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

## N. Plataforma / Panel interno de Savegre (Savegre Center)

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
| N1 | Credencial de plataforma | Credencial global (`platform_<keyId>.<secret>`, sin `tenantId`), generada solo por script (`scripts/crear-credencial-plataforma.ts`, no hay endpoint HTTP de creación). | ✅ Implementado | `src/services/plataforma/credencialPlataformaService.ts`. Prefijo elegido (`platform_`) deliberadamente sin solapamiento con `factu_` (prefijo de `ApiKey`) — un primer intento usó `factu_plat_`, que sí solapaba y hacía que `app.authenticate` intentara resolverla como `ApiKey` antes de fallar (rechazo seguro pero por la razón equivocada); corregido antes de verificar en vivo. |
| N2 | Guarda `requierePlataforma` | Decorator de Fastify completamente separado de `authenticate`/`requierePermiso`; deja el principal en `request.plataforma` (nunca en `request.user`). | ✅ Implementado | `src/plugins/auth.ts`. Verificado en vivo (servidor real, Postgres real, ver abajo) y ahora también con una suite E2E automatizada (`e2e/plataforma.spec.ts`, Playwright): una credencial de plataforma contra `GET /auditoria` (ruta de tenant) → 401; `GET /plataforma/tenants` sin token, o con un Bearer con prefijo `factu_` → 401. |
| N3 | Listado y detalle de tenants | `GET /plataforma/tenants` (id, nombre, conteo de usuarios/emisores, plan+estado de suscripción) y `GET /plataforma/tenants/:id` (+ `estadisticasService.resumen` + historial de pagos). | ✅ Implementado | `src/routes/plataforma.ts`. Requirió agregar `TenantRepository.listarTodos()` (no existía — solo `crear`/`buscar`), implementado en `memory.ts` y `prisma.ts`. |
| N4 | Suscripción por tenant | Plan, estado (`activa`/`suspendida`/`cancelada`), moneda, ciclo, descuento, fechas, notas — 1:1 con `Tenant`. Un tenant sin fila se trata como `activa` (mismo criterio que ya usa el panel equivalente de RestroCloud). | ✅ Implementado | Modelo `Suscripcion` (`prisma/schema.prisma`), `SuscripcionService.obtener/actualizar` (`src/services/plataforma/suscripcionService.ts`). `GET/PUT /plataforma/tenants/:id/suscripcion`. |
| N5 | Historial de cobros | Registrar y listar pagos de la suscripción de un tenant (monto, moneda, método, referencia, notas, quién lo registró). | ✅ Implementado | Modelo `PagoSuscripcion`. `registrarPago` materializa una suscripción por defecto si el tenant no tenía fila propia (para poder asociarle el pago). `GET/POST /plataforma/tenants/:id/suscripcion/pagos`. |
| N6 | Resumen agregado | Conteos cross-tenant (tenants por estado, total usuarios/emisores) para el futuro dashboard de Center. | ✅ Implementado | `GET /plataforma/summary`. |
| N7 | Auditoría de cambios de plataforma | Cada actualización de suscripción/pago queda en `RegistroAuditoria` con `actorTipo: "plataforma"` y el label de la credencial como nombre del actor. | ✅ Implementado | `ActorTipo` extendido (`"usuario" \| "apikey" \| "sistema" \| "plataforma"`), `actorDesde()` en `src/services/auditoria/index.ts` con rama nueva para `kind: "plataforma"`. |
| N8 | Suite E2E de `/plataforma/*` | Pedido explícito del usuario (2026-08-26) antes de commitear: automatizar lo verificado a mano con curl, con pruebas reales de extremo a extremo (no mocks). | ✅ Implementado | `e2e/plataforma.spec.ts` + `playwright.config.ts` — **primer uso de Playwright en Factu y en todo el ecosistema Savegre**. Corre en modo `request` (sin navegador, Factu no tiene UI): levanta `buildServer()` EN PROCESO con `PERSISTENCIA=memoria` (hermético, sin depender de Postgres), crea un tenant y una credencial de plataforma directamente vía los servicios, y llama la API real por HTTP. 7/7 tests verdes: listado/detalle de tenant, actualizar suscripción, registrar y listar pagos, 404 de tenant inexistente, y las 3 guardas cruzadas (N2). Encontró y corrigió un bug real del propio test (fecha `"2026-01-01"` sin hora violaba el `format: date-time` del schema — el 400 de validación de Fastify corre antes que el handler, así que llegaba antes que el 404 esperado; no es un bug de la ruta). Requirió agregar `vitest.config.ts` (no existía) para excluir `e2e/**` de Vitest — sin eso, Vitest intentaba correr el spec de Playwright directamente y fallaba en la recolección (`test.beforeAll() did not expect...`). `npm run test:e2e` en `package.json`. |

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

1. **D14 — Ejercitar los tipos de comprobante que faltan.**
   La factura simple ya fue aceptada (2026-08-09), pero descuentos, líneas exentas,
   exoneración, notas, compra, exportación y REP nunca se han enviado. Cuestan minutos
   cada uno y son el riesgo abierto más grande: un rechazo por formato solo aparece
   enviándolo. La web lleva la cuenta en su panel de ambiente.
2. **D8 — Validación automática contra el XSD oficial v4.4.**
   El contraste manual contra los cuatro esquemas ya destapó seis defectos reales (D15),
   pero fue un ejercicio puntual: sin validación en tiempo de ejecución, una regresión
   futura vuelve a descubrirse en producción. No depende de credenciales de Hacienda.
3. **B6 — Confirmar credenciales/URLs oficiales de Hacienda de producción.**
   Las de `stag` ya quedaron confirmadas en vivo dos veces (login real + emisión
   aceptada); lo único que falta es probarlo contra el ambiente `prod` real, y eso
   depende de tener credenciales de producción y de decidir cómo RestroCloud
   conseguirá/gestionará las de cada cliente — trabajo de producto, no técnico.

**D9 (consecutivos atómicos), D10 (exoneración por línea) y D15 (campos v4.4
faltantes) ya están ✅ implementados (2026-07-30/31)** — priorizados fuera de este
orden en su momento porque los pidió un cliente externo real (RestroCloud, vía API
key de servicio) con necesidad inmediata antes de integrar en serio.

## Notas generales

- **Verificación de este documento (2026-08-09, actualizado al fusionar `Revision-Daniel`
  con `main`)**: el estado se derivó leyendo el código y corriendo la suite completa —
  `npm test` → **33 archivos, 239 tests, todos en verde**; `tsc`/`npm run build` limpios.
  Los endpoints nuevos (D10, D17, E5, G4, N1-N8) no se ejercitaron con `curl` en esta
  fusión: están cubiertos por tests, no por verificación en vivo nueva.
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
