# Configuración

Todas las variables de entorno (validadas con zod en [`src/config/env.ts`](../src/config/env.ts)).
Copia `.env.example` a `.env` y complétalas — `npm run dev` (`tsx watch --env-file-if-exists=.env`)
lo carga automáticamente si existe; no falla si no existe.

## Servidor

| Variable | Requerida | Por defecto (código) | Descripción |
|---|---|---|---|
| `PORT` | no | `3000` | Puerto HTTP. **El `.env.example` de este repo lo fija en `3001`** (no `3000`) — deliberadamente distinto del puerto por defecto de RestauCloud-API, un proyecto separado que suele correr en la misma máquina de desarrollo. |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production`. |

## Persistencia

| Variable | Requerida | Por defecto | Descripción |
|---|---|---|---|
| `PERSISTENCIA` | no | `memoria` | `memoria` (sin DB) o `prisma` (PostgreSQL). |
| `DATABASE_URL` | si `prisma` | — | Cadena de conexión de PostgreSQL. |

## Seguridad

| Variable | Requerida | Descripción |
|---|---|---|
| `FACTU_MASTER_KEY` | **sí en producción** | Llave maestra para cifrar los `.p12` en reposo (AES-256-GCM). En desarrollo usa una llave insegura por defecto y avisa. |
| `JWT_SECRET` | **sí en producción** | Secreto para firmar los JWT de sesión de usuario. En desarrollo usa un secreto inseguro por defecto y avisa. |
| `JWT_EXPIRES_IN` | no | Vigencia del token de usuario (ej. `8h`, `7d`). Por defecto `8h`. |

## Hacienda

| Variable | Requerida | Descripción |
|---|---|---|
| `HACIENDA_ENV` | no | `stag` (pruebas) o `prod` (producción). Por defecto `stag`. |
| `HACIENDA_IDP_URL` | para autenticar | Endpoint de token del IDP (Keycloak) de Hacienda. |
| `HACIENDA_API_URL` | para enviar | URL base de recepción de comprobantes. |
| `HACIENDA_CLIENT_ID` | no | `client_id` del IDP (`api-stag` / `api-prod` según ambiente). |

## Firma (XAdES-EPES)

| Variable | Requerida | Descripción |
|---|---|---|
| `HACIENDA_POLICY_URL` | para EPES | URL del documento de la política de firma vigente. |
| `HACIENDA_POLICY_HASH` | para EPES | Digest SHA-256 (base64) de ese documento. |

Si no se configuran `HACIENDA_POLICY_*`, la firma se genera como **XAdES-BES**
(válida estructuralmente, pero Hacienda exige **EPES** en producción).

## Ejemplo mínimo (memoria, sin DB)

```bash
PORT=3001
FACTU_MASTER_KEY=una-llave-larga-y-aleatoria
HACIENDA_ENV=stag
HACIENDA_IDP_URL=https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token
HACIENDA_API_URL=https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1
HACIENDA_CLIENT_ID=api-stag
```
