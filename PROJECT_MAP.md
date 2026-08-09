# Mapa del proyecto — Factu

Índice de rutas → servicios → dominio/modelos, para ubicar código sin
`find`/`grep`. Es una API backend (Fastify), no hay páginas/componentes de UI.
Leer esto **antes de explorar el código** (regla en `CLAUDE.md`).

Actualizar esta tabla cuando se agregue/renombre/elimine un archivo, export o
ruta.

## Entrypoint y composición

| Archivo | Qué hace |
|---|---|
| `src/main.ts` | Arranca el servidor y los **5 pollers** en background (correo, entrega, webhooks, notificaciones, re-consulta de estado). Atrapa `unhandledRejection`/`uncaughtException` para que un poller no tumbe la API. |
| `src/server.ts` | `buildServer()`: registra seguridad, Swagger, rate limit, auth, hook de errores→logs, y todas las rutas. |
| `src/config/env.ts` | Variables de entorno tipadas (zod). |
| `src/config/hacienda.ts` | Config derivada de Hacienda: URLs oficiales del IDP/recepción y `client_id` **por ambiente** (`stag`/`prod`), sobrescribibles; `politicaFirma` y `listoParaProduccion`. |
| `src/infra/repos/index.ts` | Elige el repositorio activo (memoria o Prisma) según `PERSISTENCIA`; expone `masterKey()`. |
| `src/infra/repos/types.ts` | Interfaces de todos los repositorios (contrato memoria ↔ Prisma). |
| `src/infra/repos/memory.ts` / `prisma.ts` | Implementaciones. **Toda entidad nueva va en ambos.** |
| `src/infra/crypto/secretBox.ts` | Cifrado/descifrado AES-256-GCM de secretos (`SecretoSellado`). |

## Plugins (`src/plugins/`)

| Archivo | Qué hace |
|---|---|
| `seguridad.ts` | Cabeceras HTTP con helmet (`no-referrer`, `nosniff`, HSTS en producción). CSP apagada para no romper `/docs`. |
| `rateLimit.ts` | Techo global de 300 req/min y 10 req/min en rutas sensibles (`/auth/login`, `/auth/registro`, `/auth/password/*`, `/hacienda/login`). Clave: usuario autenticado o IP. |
| `auth.ts` | JWT + cookies. Resuelve al actor: API key (`Bearer factu_…`), JWT en header, o cookie `httpOnly`. Expone `app.authenticate` y `app.requierePermiso()`. Comprueba `Origin` (CSRF) en métodos inseguros con cookie. |
| `sesionCookie.ts` | Cookie de sesión `factu_sesion` (`httpOnly`, `SameSite=lax`, `secure` en prod). `ponerCookieSesion` / `borrarCookieSesion` / `leerCookieSesion`. |
| `swagger.ts` | OpenAPI + Scalar (`/docs`) + Swagger UI (`/swagger`). Se apaga en producción salvo `DOCS_PUBLICAS=true`. |
| `schemas.ts` | Esquemas OpenAPI de las rutas. |

## Rutas → servicios → dominio

| Ruta (`src/routes/`) | Prefijo HTTP | Servicio (`src/services/`) | Dominio/modelo relacionado |
|---|---|---|---|
| `home.ts` | `/` | — | — |
| `health.ts` | `/health` | — | — |
| `ambiente.ts` | `/ambiente` | `config/hacienda.ts` | — |
| `clave.ts` | `/clave` | — | `domain/clave/clave.ts` |
| `auth.ts` | `/auth/*` | `services/usuarios`, `services/cuentas` (OAuth + password reset) | `domain/auth/roles.ts`, modelos `Usuario`, `OAuthIdentity`, `PasswordReset` |
| `hacienda.ts` | `/hacienda/*` | `services/auth` (`haciendaAuth`, `tokenStore`) | `domain/auth/erroresIdp.ts`, modelo `SesionHacienda` |
| `emisor.ts` | `/emisor`, `/clientes*` | `services/emisor` (`certStore`) | modelos `Emisor`, `Cliente` |
| `factura.ts` | `/factura/xml` | — | `domain/factura/facturaXml.ts`, `types.ts`, `totales.ts` |
| `firma.ts` | `/firma/demo` | `services/firma` (`firmar`) | `domain` certificados demo |
| `comprobante.ts` | `/comprobante/*`, `/comprobantes` | `services/hacienda` (`emision`, `reception`, `envelope`), `services/firma`, `services/emisor` | `domain/factura/*`, `domain/validacion`, modelos `Comprobante`, `ConsecutivoEmisor` |
| `reciboPago.ts` | `/recibo-pago/enviar` | `services/hacienda`, `services/firma`, `services/emisor` | `domain/reciboPago/reciboPagoXml.ts`, modelos `Comprobante`, `ConsecutivoEmisor` |
| `borradores.ts` | `/borradores/*` | `services/borradores` (`borradorService`) | modelo `Borrador` |
| `chat.ts` | `/chat/*` | `services/chat` (`chatService`) | modelo `Mensaje` |
| `mensajeReceptor.ts` | `/mensaje-receptor/xml` | — | `domain/mensajeReceptor/mensajeReceptor.ts` |
| `documentosRecibidos.ts` | `/recibidos/*` | `services/documentosRecibidos` | modelo `DocumentoRecibido`, `domain/documentoRecibido/parseComprobante.ts` |
| `correo.ts` | `/correo*` (IMAP entrante) | `services/correo` (`correoService`, `poller.ts`) | modelo `Buzon` |
| `correoSalida.ts` | `/correo-salida*` (SMTP saliente) | `services/entrega` (`smtpConfigService`) | modelo `SmtpSaliente` |
| `estadisticas.ts` | `/estadisticas/*` | `services/estadisticas` | modelos `Comprobante`, `Emisor`, `Usuario` (agregados en base) |
| `apiKeys.ts` | `/api-keys*` | `services/apiKeys` (`apiKeyService`) | modelo `ApiKey` |
| `webhooks.ts` | `/webhooks/*` | `services/webhooks` (`webhookService`, `emitirEvento`, `poller.ts`) | modelos `Webhook`, `WebhookEntrega` |
| `auditoria.ts` | `/auditoria`, `/logs` | `services/auditoria`, `services/logs` | modelos `RegistroAuditoria`, `RegistroLog` |
| `notificaciones.ts` | `/notification-*`, `/notifications` | `services/notificaciones` (`notificacionesService`, `notificarEvento`, `poller.ts`) | modelos `NotificationChannel`, `NotificationMessage` |
| `_guards.ts` | — | Guards de rol/permiso reutilizados por las rutas (`soloAdmin`, `soloLectura`, `emisorDelTenant`) | `domain/auth/roles.ts` |
| `_pagina.ts` | — | Ventana de paginación común a los listados (`paginaSchema`, `paginaQuerystring`; 50 por defecto, 200 máximo) | — |

La entrega al cliente (`services/entrega/*`: `entregaService`, `comprobantePdf.ts`,
`emailSender.ts`, `plantillaCorreo.ts`, `poller.ts`) se dispara desde `comprobante.ts`
al emitir, y se expone en `/comprobante/:clave/reenviar` y `/comprobante/:clave/envios`.
Usa el modelo `EnvioComprobante`.

## Dominio (`src/domain/`) — lógica pura, sin infraestructura

| Módulo | Contenido |
|---|---|
| `clave/clave.ts` | Clave numérica (50 díg.) y consecutivo (20 díg.). `TipoComprobante` incluye FEC (08), FEE (09) y REP (10). |
| `factura/types.ts` | Tipos de negocio: `Emisor`, `Receptor`, `LineaDetalle`, `Moneda`, `InformacionReferencia`, enums `TipoIdentificacion`/`CondicionVenta`/`TipoMedioPago`/`CodigoImpuesto`. |
| `factura/facturaXml.ts` | Generador de XML v4.4. `TipoDocumento`: `FE`, `TE`, `NC`, `ND`, `FEC` (factura de compra), `FEE` (factura de exportación). Exporta `fechaEmisionISO()`. |
| `factura/totales.ts` | Cálculo de totales/impuestos/descuentos. |
| `reciboPago/reciboPagoXml.ts` | XML del Recibo Electrónico de Pago (REP, v4.4): estructura propia, sin CABYS ni ubicación, `InformacionReferencia` obligatoria. |
| `mensajeReceptor/mensajeReceptor.ts` | XML de Mensaje Receptor (aceptar/rechazar/parcial). |
| `documentoRecibido/parseComprobante.ts` | Parseo de un XML de comprobante recibido. |
| `validacion/validacion.ts` | `validarComprobante()`: reglas de negocio previas al envío. Acepta actividad CIIU4 (`8549.0`) y CIIU3 (`620100`). |
| `auth/roles.ts` | `Rol`, `Permiso`, `rolTienePermiso()`. |
| `auth/erroresIdp.ts` | `esCredencialInvalida()`: distingue «credenciales malas» (401) de «Hacienda falló» (502). |

## Servicios (`src/services/*/index.ts`) — export principal

| Servicio | Export de composición | Notas |
|---|---|---|
| `apiKeys` | `apiKeyService`, `API_KEY_PREFIJO` | |
| `auditoria` | `registrarAuditoria()`, `listarAuditoria()`, `actorDesde()` | Best-effort, nunca lanza. |
| `auth` | `haciendaAuth`, `tokenStore`, `SinSesionHaciendaError` | Cliente IDP de Hacienda + cache/renovación de tokens, con respaldo cifrado en `almacenSesiones.ts` (`AlmacenSesionesCifrado`). |
| `borradores` | `borradorService` | |
| `chat` | `chatService` | |
| `correo` | `correoService` | Compone con `documentosRecibidosService`. `sincronizar()` para el barrido manual. |
| `cuentas` | `cuentaService`, `passwordResetService`, `proveedorOAuth()`, `proveedoresConfigurados()` | OAuth (`GoogleProvider`, `MicrosoftProvider`) + reset de contraseña. `estado.ts` firma el `state` OAuth (HMAC, anti-CSRF); `mailerPlataforma.ts` usa el SMTP `PLATAFORMA_SMTP_*`. |
| `documentosRecibidos` | `documentosRecibidosService` | Registrar, generar y **enviar** el mensaje receptor a Hacienda. |
| `emisor` | `certStore` | Certificados `.p12` cifrados. |
| `entrega` | `entregaService`, `smtpConfigService`, `construirTransport()` | Envío al cliente + config SMTP saliente. |
| `estadisticas` | `estadisticasService` | `resumen`, `montos`, `porEmisor`, `serie`. Los agregados los calcula la base, no el proceso. |
| `firma` | `firmar()`, `politicaHacienda()` | XAdES-BES, o EPES si hay política configurada. |
| `hacienda` | `receptionClient`, `emitirComprobante()`, `construirEnvelope()` | Envío a recepción + `emision.ts` (orquestador) + `envelope.ts` (sobre base64) + `reconsulta.ts`/`pollerReconsulta.ts` (barrido de comprobantes sin veredicto). |
| `logs` | `registrarLog()`, `listarLogs()` | Best-effort, nunca lanza. |
| `notificaciones` | `notificacionesService`, `notificarEvento()`, `providerRegistry` | Proveedores: `twilioSms`, `whatsappCloud`, `slack`, `teams`, `bitrix24`, `http` (patrón Strategy, `NotificationProvider`). |
| `usuarios` | `usuarioService` | |
| `webhooks` | `webhookService`, `emitirEvento()` | |

## Modelos Prisma (`prisma/schema.prisma`)

`Tenant`, `Usuario`, `OAuthIdentity`, `PasswordReset`, `ApiKey`, `Emisor`,
`Cliente`, `Comprobante`, `ConsecutivoEmisor`, `SesionHacienda`, `Borrador`,
`DocumentoRecibido`, `Buzon`, `SmtpSaliente`, `EnvioComprobante`, `Webhook`,
`WebhookEntrega`, `NotificationChannel`, `NotificationMessage`, `Mensaje`,
`RegistroAuditoria`, `RegistroLog`.

## Scripts de mantenimiento (`scripts/`)

| Archivo | Qué hace |
|---|---|
| `rotar-llave-maestra.mjs` | Recifra todo lo sellado con `FACTU_MASTER_KEY` al cambiar la llave (`LLAVE_VIEJA=… LLAVE_NUEVA=… node scripts/rotar-llave-maestra.mjs`). |
| `rellenar-totales.mjs` | Backfill de `total`/`moneda` en comprobantes viejos, leyéndolos del XML firmado ya guardado (`--dry-run` disponible). |

## Documentación relacionada

| Archivo | Contenido |
|---|---|
| `docs/primeros-pasos.md` | Instalar, configurar y levantar. |
| `docs/conexion-hacienda.md` | Guía completa del flujo de emisión, paso a paso. |
| `docs/configuracion.md` | Todas las variables de entorno. |
| `docs/api.md` | Referencia de endpoints, roles y códigos de respuesta. |
| `docs/despliegue.md` | Docker/docker-compose y notas de producción. |
