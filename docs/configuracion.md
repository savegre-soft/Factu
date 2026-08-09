# Configuración

Todas las variables de entorno (validadas con zod en [`src/config/env.ts`](../src/config/env.ts)).
Copia `.env.example` a `.env` y complétalas.

## Servidor

| Variable | Requerida | Por defecto | Descripción |
|---|---|---|---|
| `PORT` | no | `3000` | Puerto HTTP. |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production`. |
| `DOCS_PUBLICAS` | no | — | `true`/`false`. Publica `/docs` y `/swagger`. Por defecto: encendidas en desarrollo, **apagadas en producción** (exponen el mapa completo de la API sin autenticación). |

## Persistencia

| Variable | Requerida | Por defecto | Descripción |
|---|---|---|---|
| `PERSISTENCIA` | no | `memoria` | `memoria` (sin DB) o `prisma` (PostgreSQL). |
| `DATABASE_URL` | si `prisma` | — | Cadena de conexión de PostgreSQL. |

## Seguridad

| Variable | Requerida | Descripción |
|---|---|---|
| `FACTU_MASTER_KEY` | **sí en producción** | Llave maestra para cifrar en reposo los `.p12`, los tokens del IDP y las credenciales SMTP/IMAP (AES-256-GCM). En desarrollo usa una llave insegura por defecto y avisa. Cambiarla exige recifrar: `LLAVE_VIEJA=… LLAVE_NUEVA=… node scripts/rotar-llave-maestra.mjs`. |
| `JWT_SECRET` | **sí en producción** | Secreto para firmar los JWT de sesión y el `state` del OAuth. En desarrollo usa un secreto inseguro por defecto y avisa. |
| `JWT_EXPIRES_IN` | no | Vigencia del token de usuario (ej. `8h`, `7d`). Por defecto `8h`. También determina la vida de la cookie de sesión. |

Genera valores con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # FACTU_MASTER_KEY
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # JWT_SECRET
```

## Hacienda

| Variable | Requerida | Descripción |
|---|---|---|
| `HACIENDA_ENV` | no | `stag` (pruebas) o `prod` (producción). Por defecto `stag`. **De aquí se derivan las URLs y el `client_id`**: `stag` → realm `rut-stag` + `api-sandbox`; `prod` → realm `rut` + `api`. |
| `HACIENDA_IDP_URL` | no | Sobrescribe el endpoint de token del IDP (Keycloak) del ambiente. |
| `HACIENDA_API_URL` | no | Sobrescribe la URL base de recepción de comprobantes. |
| `HACIENDA_CLIENT_ID` | no | Sobrescribe el `client_id` (`api-stag` / `api-prod`). |
| `PROVEEDOR_SISTEMAS` | no | Cédula del proveedor del software emisor (nodo `ProveedorSistemas`, obligatorio en v4.4). Si se deja vacío, se usa la cédula del propio emisor. |

`GET /ambiente` muestra la configuración efectiva y si está listo para producción.

## Firma (XAdES-EPES)

| Variable | Requerida | Descripción |
|---|---|---|
| `HACIENDA_POLICY_URL` | para EPES | URL del documento de la política de firma vigente. |
| `HACIENDA_POLICY_HASH` | para EPES | Digest SHA-256 (base64) de ese documento. |

`.env.example` ya trae los valores de la resolución **DGT-R-48-2016 v4.1**. Sin estas
variables la firma se genera como **XAdES-BES** y Hacienda la rechaza con
«La firma del documento no tiene el Policy Id».

## Pollers en segundo plano

| Variable | Por defecto | Descripción |
|---|---|---|
| `CORREO_POLL_ENABLED` / `CORREO_POLL_MINUTOS` | `true` / `5` | Revisa los buzones IMAP en busca de XML entrantes. |
| `RECONSULTA_ENABLED` / `RECONSULTA_MINUTOS` | `true` / `10` | Vuelve a consultar en Hacienda los comprobantes sin veredicto. Sin esto, uno cuyo estado tarde más que la ventana de la emisión (~15 s) se queda en «recibido» para siempre. |
| `ENTREGA_ENABLED` / `ENTREGA_POLL_MINUTOS` / `ENTREGA_MAX_INTENTOS` | `true` / `5` / `3` | Reintentos del envío del comprobante al cliente. |
| `WEBHOOK_ENABLED` / `WEBHOOK_POLL_MINUTOS` / `WEBHOOK_MAX_INTENTOS` | `true` / `5` / `5` | Reintentos de webhooks salientes. |
| `NOTIF_ENABLED` / `NOTIF_POLL_MINUTOS` / `NOTIF_MAX_INTENTOS` | `true` / `2` / `5` | Reintentos de notificaciones (SMS, WhatsApp, Slack, Teams…). |

## Correo saliente — entrega de comprobantes al cliente

Es el SMTP con el que la API entrega el PDF + XML al receptor. Puede configurarse por
tenant desde `/correo-salida`; estas variables son el valor por defecto de la instancia.

| Variable | Por defecto | Descripción |
|---|---|---|
| `SMTP_HOST` | — | Servidor SMTP (SendGrid, SES, Mailgun… vía SMTP). |
| `SMTP_PORT` | `587` | Puerto. |
| `SMTP_SECURE` | `false` | `true` = TLS directo (465); `false` = STARTTLS (587). |
| `SMTP_USER` / `SMTP_PASS` | — | Credenciales. |
| `SMTP_FROM` | — | Remitente visible, ej. `Mi Empresa <facturas@empresa.cr>`. |

## Correo de la plataforma — cuentas de usuario

**Distinto del anterior**: es el remitente con el que Factu le escribe a sus propios
usuarios (código de recuperación de contraseña).

| Variable | Por defecto | Descripción |
|---|---|---|
| `PLATAFORMA_SMTP_HOST` | — | Servidor SMTP de la plataforma. |
| `PLATAFORMA_SMTP_PORT` | `587` | Puerto. |
| `PLATAFORMA_SMTP_SECURE` | `false` | TLS directo o STARTTLS. |
| `PLATAFORMA_SMTP_USER` / `_PASS` | — | Credenciales. |
| `PLATAFORMA_SMTP_FROM` | — | Remitente, ej. `Factu <no-reply@miplataforma.cr>`. |
| `PASSWORD_RESET_TTL_MINUTOS` | `15` | Vigencia del código de recuperación. |

## URLs públicas y OAuth

| Variable | Por defecto | Descripción |
|---|---|---|
| `APP_URL` | `http://localhost:5173` | Base del frontend: a donde vuelve el OAuth, y origen aceptado en el chequeo anti-CSRF. |
| `API_PUBLIC_URL` | `http://localhost:3000` | Base pública de esta API (el `redirect_uri` registrado en Google/Microsoft). Si es `https://` y `NODE_ENV=production`, la cookie de sesión se marca `secure`. |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | — | Credenciales de Google. |
| `MICROSOFT_OAUTH_CLIENT_ID` / `_SECRET` | — | Credenciales de Microsoft. |
| `MICROSOFT_OAUTH_TENANT` | `common` | `common`, `organizations` o un GUID de Azure AD. |

## Ejemplo mínimo (memoria, sin DB)

```bash
PORT=3000
FACTU_MASTER_KEY=una-llave-larga-y-aleatoria
JWT_SECRET=un-secreto-largo-y-aleatorio
HACIENDA_ENV=stag
# Las URLs y el client_id se derivan solos de HACIENDA_ENV.
HACIENDA_POLICY_URL="https://www.hacienda.go.cr/docs/Resolucion_Comprobantes_Electronicos_DGT-R-48-2016_v4.1.pdf"
HACIENDA_POLICY_HASH="vPjYEG5pdxOi+6DB29+KqF3I4VOcMEaixzE3d2iUiJk="
```
