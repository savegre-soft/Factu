# Mapa del proyecto — Factu

Índice de rutas → servicios → dominio/modelos, para ubicar código sin
`find`/`grep`. Es una API backend (Fastify), no hay páginas/componentes de UI.
Leer esto **antes de explorar el código** (regla en `CLAUDE.md`).

Actualizar esta tabla cuando se agregue/renombre/elimine un archivo, export o
ruta.

## Entrypoint y composición

| Archivo | Qué hace |
|---|---|
| `src/main.ts` | Arranca el servidor y los 4 pollers en background (correo, entrega, webhooks, notificaciones). |
| `src/server.ts` | `buildServer()`: registra Swagger, auth, hook de errores→logs, y todas las rutas. |
| `src/config/env.ts` | Variables de entorno tipadas (zod). |
| `src/config/hacienda.ts` | Config derivada de Hacienda (ambiente, URLs, si está "listo para producción"). |
| `src/infra/repos/index.ts` | Elige el repositorio activo (memoria o Prisma) según `PERSISTENCIA`; expone `masterKey()`. |
| `src/infra/repos/types.ts` | Interfaces de todos los repositorios (contrato memoria ↔ Prisma). |
| `src/infra/repos/memory.ts` / `prisma.ts` | Implementaciones. **Toda entidad nueva va en ambos.** |
| `src/infra/crypto/secretBox.ts` | Cifrado/descifrado AES-256-GCM de secretos (`SecretoSellado`). |

## Rutas → servicios → dominio

| Ruta (`src/routes/`) | Prefijo HTTP | Servicio (`src/services/`) | Dominio/modelo relacionado |
|---|---|---|---|
| `home.ts` | `/` | — | — |
| `health.ts` | `/health` | — | — |
| `ambiente.ts` | `/ambiente` | `config/hacienda.ts` | — |
| `clave.ts` | `/clave` | — | `domain/clave/clave.ts` |
| `auth.ts` | `/auth/*` | `services/usuarios`, `services/cuentas` (OAuth + password reset) | `domain/auth/roles.ts`, modelos `Usuario`, `OAuthIdentity`, `PasswordReset` |
| `hacienda.ts` | `/hacienda/*` | `services/auth` (`haciendaAuth`, `tokenStore`) | — |
| `emisor.ts` | `/emisor`, `/clientes*` | `services/emisor` (`certStore`) | modelos `Emisor`, `Cliente` |
| `factura.ts` | `/factura/xml` | — | `domain/factura/facturaXml.ts`, `types.ts`, `totales.ts` |
| `firma.ts` | `/firma/demo` | `services/firma` (`firmar`) | `domain` certificados demo |
| `comprobante.ts` | `/comprobante/*`, `/comprobantes` | `services/hacienda` (`emision`, `reception`), `services/firma`, `services/emisor` | `domain/factura/*`, `domain/validacion`, modelo `Comprobante` |
| `borradores.ts` | `/borradores/*` | `services/borradores` (`borradorService`) | modelo `Borrador` |
| `chat.ts` | `/chat/*` | `services/chat` (`chatService`) | modelo `Mensaje` |
| `mensajeReceptor.ts` | `/mensaje-receptor/xml` | — | `domain/mensajeReceptor/mensajeReceptor.ts` |
| `documentosRecibidos.ts` | `/recibidos/*` | `services/documentosRecibidos` | modelo `DocumentoRecibido`, `domain/documentoRecibido/parseComprobante.ts` |
| `correo.ts` | `/correo*` (IMAP entrante) | `services/correo` (`correoService`, `poller.ts`) | modelo `Buzon` |
| `correoSalida.ts` | `/correo-salida*` (SMTP saliente) | `services/entrega` (`smtpConfigService`) | modelo `SmtpSaliente` |
| `estadisticas.ts` | `/estadisticas/*` | `services/estadisticas` | modelos `Comprobante`, `Emisor`, `Usuario` (agregados) |
| `apiKeys.ts` | `/api-keys*` | `services/apiKeys` (`apiKeyService`) | modelo `ApiKey` |
| `webhooks.ts` | `/webhooks/*` | `services/webhooks` (`webhookService`, `emitirEvento`, `poller.ts`) | modelos `Webhook`, `WebhookEntrega` |
| `auditoria.ts` | `/auditoria`, `/logs` | `services/auditoria`, `services/logs` | modelos `RegistroAuditoria`, `RegistroLog` |
| `notificaciones.ts` | `/notification-*`, `/notifications` | `services/notificaciones` (`notificacionesService`, `notificarEvento`, `poller.ts`) | modelos `NotificationChannel`, `NotificationMessage` |
| `_guards.ts` | — | Guards de tenant/permiso reutilizados por las rutas: `emisorDelTenant()` (existe + pertenece al tenant + dentro del scope de emisores de una API key), `puedeGestionarEmisor()` (B7, 2026-07-30 — humano admin, o API key `facturador` scoped a esa cédula) | `domain/auth/roles.ts` |
| `plataforma.ts` | `/plataforma/*` | `services/plataforma` (`credencialPlataformaService`, `suscripcionService`) | `domain`: n/a (sin dominio propio); modelos `Suscripcion`, `PagoSuscripcion`, `CredencialPlataforma` (L1-L7, 2026-08-25/26) |

La entrega al cliente (`services/entrega/*`: `entregaService`, `comprobantePdf.ts`,
`emailSender.ts`, `plantillaCorreo.ts`, `poller.ts`) se dispara desde `comprobante.ts`
al emitir, y se expone en `/comprobante/:clave/reenviar` y `/comprobante/:clave/envios`.
Usa el modelo `EnvioComprobante`. `GET /comprobante/:clave/pdf` (2026-07-31, fila F2)
devuelve el PDF real en `pdfBase64` para descarga directa, sin pasar por correo —
reusa `parsearParaPdf`/`generarFacturaPdf` de `comprobantePdf.ts` sin duplicar lógica.

## Dominio (`src/domain/`) — lógica pura, sin infraestructura

| Módulo | Contenido |
|---|---|
| `clave/clave.ts` | Clave numérica (50 díg.) y consecutivo (20 díg.). |
| `factura/types.ts` | Tipos de negocio: `Emisor`, `Receptor`, `LineaDetalle`, `Moneda`, `InformacionReferencia`, `Exoneracion` (por impuesto/línea, D10, 2026-07-30), enums `TipoIdentificacion`/`CondicionVenta`. `FacturaInput.proveedorSistemas?` (D11, 2026-07-31 — cédula del proveedor de sistemas, default a la del emisor). |
| `factura/facturaXml.ts` | Generador de XML v4.4 (`TipoDocumento`: factura, tiquete, NC, ND). Incluye `ProveedorSistemas` (encabezado, entre `Clave` y `CodigoActividadEmisor`) e `ImpuestoAsumidoEmisorFabrica` (por línea, fijo "0") — D11, 2026-07-31, campos obligatorios de v4.4 encontrados por rechazo real de Hacienda. |
| `factura/totales.ts` | Cálculo de totales/impuestos/descuentos. |
| `mensajeReceptor/mensajeReceptor.ts` | XML de Mensaje Receptor (aceptar/rechazar/parcial). |
| `documentoRecibido/parseComprobante.ts` | Parseo de un XML de comprobante recibido. |
| `validacion/validacion.ts` | `validarComprobante()`: reglas de negocio previas al envío. |
| `auth/roles.ts` | `Rol`, `Permiso`, `rolTienePermiso()`. |

## Servicios (`src/services/*/index.ts`) — export principal

| Servicio | Export de composición | Notas |
|---|---|---|
| `apiKeys` | `apiKeyService` | |
| `auditoria` | `registrarAuditoria()`, `listarAuditoria()`, `actorDesde()` | Best-effort, nunca lanza. |
| `auth` | `haciendaAuth`, `tokenStore` | Cliente IDP de Hacienda + cache/renovación de tokens. |
| `borradores` | `borradorService` | |
| `chat` | `chatService` | |
| `correo` | `correoService` | Compone con `documentosRecibidosService`. |
| `cuentas` | `cuentaService`, `passwordResetService`, `proveedorOAuth()`, `proveedoresConfigurados()` | OAuth (`GoogleProvider`, `MicrosoftProvider`) + reset de contraseña. |
| `documentosRecibidos` | `documentosRecibidosService` | |
| `emisor` | `certStore` | Certificados `.p12` cifrados. |
| `entrega` | `entregaService`, `smtpConfigService` | Envío al cliente + config SMTP saliente. |
| `estadisticas` | `estadisticasService` | |
| `firma` | `firmar()`, `politicaHacienda()` | XAdES-BES, o EPES si hay política configurada. |
| `hacienda` | `receptionClient` | Envío a recepción + `emision.ts` (orquestador). |
| `logs` | `registrarLog()`, `listarLogs()` | Best-effort, nunca lanza. |
| `notificaciones` | `notificacionesService`, `notificarEvento()`, `providerRegistry` | Proveedores: `twilioSms`, `whatsappCloud`, `slack`, `teams`, `bitrix24` (patrón Strategy, `NotificationProvider`). |
| `usuarios` | `usuarioService` | |
| `webhooks` | `webhookService`, `emitirEvento()` | |
| `plataforma` | `credencialPlataformaService`, `suscripcionService` | Panel interno de Savegre (Savegre Center) — cross-tenant, autenticación separada (`app.requierePlataforma`, nunca `request.user`). |

## Modelos Prisma (`prisma/schema.prisma`)

`Tenant`, `Usuario`, `OAuthIdentity`, `PasswordReset`, `ApiKey`, `Emisor`,
`Cliente`, `Comprobante`, `ConsecutivoContador` (D9, 2026-07-30 — contador
atómico de consecutivo por emisor+sucursal+terminal+tipo), `Borrador`,
`DocumentoRecibido`, `Buzon`, `SmtpSaliente`, `EnvioComprobante`, `Webhook`,
`WebhookEntrega`, `NotificationChannel`, `NotificationMessage`, `Mensaje`,
`RegistroAuditoria`, `RegistroLog`, `Suscripcion`, `PagoSuscripcion` (L4/L5,
2026-08-26 — suscripción y cobros de Savegre a un tenant, panel interno),
`CredencialPlataforma` (L1 — credencial global, sin `tenantId`).

## Testing

| Archivo | Qué es |
|---|---|
| `vitest.config.ts` | Config de Vitest (unitarios, `src/**/*.test.ts`); excluye `e2e/**` para no chocar con Playwright. |
| `playwright.config.ts`, `e2e/plataforma.spec.ts` | E2E de API con Playwright (modo `request`, sin navegador — Factu no tiene UI). Levanta `buildServer()` en proceso, `PERSISTENCIA=memoria`. `npm run test:e2e`. Primer uso de Playwright en el ecosistema. |

## Documentación relacionada

| Archivo | Contenido |
|---|---|
| `docs/primeros-pasos.md` | Instalar, configurar y levantar. |
| `docs/conexion-hacienda.md` | Guía completa del flujo de emisión, paso a paso. |
| `docs/configuracion.md` | Todas las variables de entorno. |
| `docs/api.md` | Referencia de endpoints, roles y códigos de respuesta. |
| `docs/despliegue.md` | Docker/docker-compose y notas de producción. |
