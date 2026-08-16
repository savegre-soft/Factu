# Documentación — Factu

> Para el estado detallado de cada requerimiento (qué está hecho, qué falta),
> ver [REQUIREMENTS.md](./REQUIREMENTS.md). Para ubicar código rápido, ver
> [PROJECT_MAP.md](./PROJECT_MAP.md).

---

## Parte 1 — Para el cliente (qué hace el sistema hoy)

Factu es el sistema que emite las **facturas electrónicas** de tu empresa ante el
Ministerio de Hacienda de Costa Rica y las entrega a tus clientes, todo desde una
sola plataforma.

### Qué resuelve

- **Emitir comprobantes**: factura, tiquete electrónico, nota de crédito, nota de
  débito, factura de compra (cuando le comprás a alguien no inscrito), factura de
  exportación y **recibo electrónico de pago**. El sistema arma el documento, lo
  firma digitalmente y lo envía a Hacienda, esperando la confirmación de que fue
  **aceptado** o avisando si fue **rechazado** (y por qué).
- **Cobrar una venta a crédito**: cuando facturaste a crédito y después te pagan,
  la versión 4.4 obliga a emitir un **recibo electrónico de pago** que apunta a la
  factura que se está cobrando. El sistema lo emite igual que una factura.
- **Numeración automática**: el sistema lleva el consecutivo de cada emisor y tipo
  de documento. No tenés que acordarte del último número, y dos personas
  facturando al mismo tiempo nunca repiten uno.
- **No perder comprobantes en el limbo**: si Hacienda tarda en responder, el
  sistema vuelve a preguntar solo hasta obtener el veredicto, y recién ahí avisa y
  entrega el comprobante.
- **Facturar a quien está exonerado**: zonas francas, instituciones exoneradas
  o diplomáticos. El impuesto se calcula y se rebaja en el porcentaje exonerado,
  declarando el documento que lo respalda.
- **Seguir facturando si Hacienda se cae**: el comprobante se emite marcado
  **en contingencia** y se transmite cuando el servicio vuelve.
- **Guardar avances**: si estás llenando una factura y no la terminás, queda
  como **borrador** para retomarla después.
- **Recordar a tus clientes**: una vez que facturaste a alguien, la próxima vez
  el sistema te sugiere sus datos automáticamente.
- **Entregar la factura**: le manda automáticamente a tu cliente un correo con
  el comprobante (PDF + XML), y lleva un historial de esos envíos por si hay
  que reenviar alguno.
- **Recibir facturas de tus proveedores**: podés cargar manualmente los
  comprobantes que te envían, o conectar tu buzón de correo para que el
  sistema los detecte solo. Con eso generás **y enviás** la respuesta de
  aceptación o rechazo (el "mensaje receptor") que exige Hacienda, que es una
  obligación con plazo.
- **Organizaciones y usuarios**: cada empresa (organización) tiene sus propios
  usuarios con distintos permisos — quién puede solo consultar, quién puede
  facturar, y quién además administra usuarios y certificados.
- **Iniciar sesión con Google o Microsoft**, además del usuario y contraseña
  propios de Factu, y recuperar la contraseña si la olvidás.
- **Estadísticas**: cuánto facturaste (por moneda y por mes, con las notas de
  crédito ya restadas), cuántos comprobantes fueron aceptados o rechazados, cómo
  evoluciona en el tiempo y cómo se reparte entre tus emisores.
- **Conectar con otros sistemas**:
  - **Integraciones vía API key**: para que tu ERP o sistema de ventas emita
    facturas directamente, sin pasar por la pantalla de Factu.
  - **Webhooks**: para avisarle a otro sistema tuyo cada vez que pasa algo
    (ej. "se aceptó una factura").
  - **Notificaciones**: avisos por SMS, WhatsApp, Slack, Teams o Bitrix24 cuando
    ocurren ciertos eventos.
- **Auditoría**: queda registrado quién hizo qué y cuándo (quién emitió, quién
  creó un usuario, quién cambió una configuración), para poder revisarlo
  después.
- **Chat interno**: los usuarios de una misma organización se pueden escribir
  entre sí dentro del sistema.

### Cómo cuida tus datos

- El certificado digital (`.p12`), su PIN, las contraseñas de correo y las
  credenciales de las integraciones se guardan **cifrados**; el sistema nunca los
  devuelve en claro.
- La sesión del navegador vive en una cookie que el JavaScript de la página no
  puede leer, para que un ataque en el navegador no pueda robarla.
- Los intentos de inicio de sesión están limitados, de modo que nadie pueda
  probar contraseñas a la fuerza.

### Qué falta para producción real

El **9 de agosto de 2026 Hacienda aceptó la primera factura** emitida por el
sistema en su sandbox real, con certificado y credenciales reales. Eso confirmó
que la cadena completa funciona: clave, XML v4.4, firma con política, envío y
consulta de estado. Lo que falta antes de facturarle a clientes reales:

- **Probar los demás tipos de comprobante.** La factura aceptada no llevaba
  descuento ni línea exenta, y no se ha emitido todavía una nota de crédito, una
  factura de compra, una de exportación ni un recibo de pago. Todos están
  verificados contra el esquema oficial y con pruebas automatizadas, pero un
  rechazo por formato solo se descubre enviándolo. La aplicación web lleva la
  cuenta de cuáles faltan en su panel de ambiente.
- **Pasar el sistema a producción** (`HACIENDA_ENV=prod`) y confirmar allí que la
  "política de firma" configurada sigue siendo la resolución vigente: en pruebas
  la actual es aceptada.
- **Revisar que cada emisor tenga su certificado propio**: sin él se firma con
  uno de prueba que Hacienda rechaza en producción.

Ver el detalle fila por fila en [REQUIREMENTS.md](./REQUIREMENTS.md).

---

## Parte 2 — Para el desarrollador

### Stack

| Capa | Herramienta |
|---|---|
| Runtime | Node ≥ 20 · TypeScript (ESM, estricto) |
| HTTP | Fastify 5 · `@fastify/swagger` |
| Persistencia | Prisma + PostgreSQL, o backend en memoria (`PERSISTENCIA=memoria`) |
| XML | xmlbuilder2 · `@xmldom/xmldom` · xpath |
| Firma | xadesjs · node-forge (certificados `.p12`) |
| Validación | zod (esquemas HTTP) + validación de dominio (reglas de negocio) |
| Auth | `@fastify/jwt` · `@fastify/cookie` · scrypt (multi-tenant + roles) |
| Seguridad | `@fastify/helmet` · `@fastify/rate-limit` |
| Correo | nodemailer (saliente/SMTP) · imapflow + mailparser (entrante/IMAP) |
| PDF | pdfkit |
| Docs | Scalar · Swagger UI · OpenAPI |
| Tests | Vitest — 30 archivos, 209 tests |

### Cómo correr el proyecto

```bash
# Local, sin base de datos (persistencia en memoria)
npm install
cp .env.example .env
npm run dev                 # http://localhost:3000 · docs en /docs

# Con Docker (API + PostgreSQL)
docker compose up --build
```

Otros scripts: `npm test` (Vitest), `npm run typecheck`, `npm run build`,
`npm start` (versión compilada). Variables de entorno completas en
[docs/configuracion.md](./docs/configuracion.md).

### Dónde está corriendo

| Entorno | Qué | Cómo se levanta |
|---|---|---|
| Laptop | API + PostgreSQL | `docker compose up -d --build` |
| Servidor `mecsa00` (192.168.1.3) | API en `:3000`, webapp en `:8080` | `docker compose -f docker-compose.server.yml up -d --build` en `~/Factu`, y `docker compose --profile prod up -d web-prod` en `~/FactuWeb` |

El servidor es **compartido** con otros proyectos (supabase, wapi, e7r, e8a,
pulpepos), así que este stack solo toma los puertos 3000 y 8080; la base de datos
no publica el 5432 porque ahí ya escucha `supabase-pooler`. El código no se
despliega con git: `~/Factu` y `~/FactuWeb` se sincronizan copiando el árbol de
fuentes por ssh y reconstruyendo la imagen en el servidor.

Dos cosas que hay que respetar al desplegar:

- **El `.env` y la base van juntos.** Los `.p12` y los tokens del IDP se guardan
  cifrados con `FACTU_MASTER_KEY`. Restaurar un dump contra una llave distinta no
  da error: los datos quedan ilegibles y solo se descubre al intentar firmar.
- **`APP_URL` tiene que ser el origen real del navegador** (`http://192.168.1.3:8080`).
  Es el `Origin` que acepta el chequeo anti-CSRF; con `localhost` toda escritura
  desde la webapp respondería 403.

### Arquitectura, en breve

```
src/
├── config/        Variables de entorno tipadas (zod) + config de Hacienda por ambiente
├── domain/        Lógica de negocio PURA (sin infraestructura, 100% testeable)
│   ├── clave/          Clave numérica (50 díg.) y consecutivo
│   ├── factura/        Modelo, totales y generador de XML v4.4 (FE/TE/NC/ND/FEC/FEE)
│   ├── reciboPago/     XML del Recibo Electrónico de Pago (REP)
│   ├── mensajeReceptor/ XML de Mensaje Receptor
│   ├── documentoRecibido/ Parseo de comprobantes recibidos
│   ├── validacion/     Reglas de negocio previas al envío
│   └── auth/           Roles, permisos y clasificación de errores del IDP
├── services/      Casos de uso e integraciones (inyectan sus dependencias)
│   ├── auth/, cuentas/, usuarios/     Sesión Hacienda, OAuth, password reset
│   ├── emisor/, firma/                Certificados .p12 + firma XAdES
│   ├── hacienda/                      Sobre, envío a recepción, estado y re-consulta
│   ├── borradores/, apiKeys/          Borradores de emisión, API keys
│   ├── correo/, entrega/              Correo entrante (IMAP) y saliente (SMTP + PDF)
│   ├── documentosRecibidos/           Documentos que la empresa recibió
│   ├── webhooks/, notificaciones/     Integraciones salientes
│   ├── estadisticas/, auditoria/, logs/ Reportes y observabilidad
│   └── chat/                          Mensajería interna
├── infra/         crypto/ (cifrado AES-256-GCM) · repos/ (memoria + Prisma)
├── plugins/       Seguridad (helmet), rate limit, auth (JWT/cookie/API key), Swagger
├── routes/        Endpoints HTTP (Fastify) — un archivo por área
└── main.ts        Entrypoint: arranca el server + los pollers en background
```

El dominio no depende de nada externo. Los **5 pollers** (`services/*/poller.ts`)
corren en segundo plano desde `main.ts` para: correo entrante, reintentos de
entrega al cliente, reintentos de webhooks, reintentos de notificaciones, y
re-consulta del estado de los comprobantes que Hacienda dejó sin veredicto.

### Flujo de emisión

```
Reservar consecutivo (atómico, por emisor/sucursal/terminal/tipo)
  → generar clave (50 díg.)  → generar XML v4.4  → firmar XAdES
  → construir el sobre (XML en base64 + metadatos)  → enviar a recepción
  → esperar el estado (~15 s)
```

Dos reglas que ordenan el resto del código:

1. **El punto de no retorno es la entrega a Hacienda.** Antes de él, un fallo
   devuelve el consecutivo a la serie y responde 502/401 con normalidad. Después
   de él, ningún error posterior (persistencia, webhook, notificación, entrega al
   cliente) puede reportarse como «fallo al emitir»: el usuario reintentaría y
   duplicaría el documento. Si no se pudo guardar, la respuesta incluye una
   `advertencia` con la clave.
2. **Si Hacienda no resolvió en esos ~15 s, no se pierde.** El poller de
   re-consulta lo retoma y dispara los mismos efectos que habría disparado la
   emisión.

### Autenticación: tres formas de presentarse

| Actor | Cómo llega | Dónde se resuelve |
|---|---|---|
| Navegador | Cookie `factu_sesion` (`httpOnly`) | `plugins/sesionCookie.ts` + `plugins/auth.ts` |
| Cliente no-navegador | `Authorization: Bearer <JWT>` | `plugins/auth.ts` |
| Integración externa | `Authorization: Bearer factu_…` (API key) | `services/apiKeys` |

En métodos que cambian estado y vienen autenticados por cookie, el servidor exige
que el `Origin` sea propio (`APP_URL` o el host de la petición): `SameSite=lax` es
la defensa del navegador, esta es la del servidor.

### Convenciones

- **Idioma**: nombres de dominio, rutas y mensajes al usuario en **español**
  (`emisor`, `clave`, `comprobante`, `borradores`); identificadores técnicos
  genéricos pueden ir en inglés si el resto del código ya lo hace.
- **Dominio puro**: `src/domain/**` no importa nada de `services/`, `infra/`
  ni `routes/` — se testea sin red, sin certificados y sin base de datos.
- **Persistencia dual obligatoria**: toda entidad nueva necesita su
  implementación en `src/infra/repos/memory.ts` (para dev/tests) y
  `src/infra/repos/prisma.ts` (para producción), detrás de la interfaz común
  en `src/infra/repos/types.ts`. Nunca agregar un modelo solo a uno de los dos.
- **Secretos**: cualquier credencial (`.p12`, tokens del IDP, contraseñas
  SMTP/IMAP, secretos de webhook, config de canales de notificación) se guarda
  cifrada con `src/infra/crypto/secretBox.ts` (`SecretoSellado`), nunca en claro.
- **Listados paginados y sin XML**: los listados devuelven
  `{ total, limite, desplazamiento, items }` con el esquema común de
  `src/routes/_pagina.ts` (50 por defecto, 200 máximo), y los comprobantes se
  listan como `ComprobanteResumen` — sin `xmlFirmado` ni `respuestaXml`, que pesan
  ~13 KB cada uno.
- **Agregar en la base, no en el proceso**: las estadísticas se calculan con
  consultas agregadas, no descargando filas para sumarlas en Node.
- **Rutas**: un archivo por área de negocio en `src/routes/`, registrado en
  `src/server.ts`. Los guards de rol/permiso viven en `src/routes/_guards.ts`.
- **Tests**: Vitest, un `*.test.ts` junto al archivo que prueba.

### Mantenimiento

| Script | Cuándo |
|---|---|
| `node scripts/rotar-llave-maestra.mjs` | Al cambiar `FACTU_MASTER_KEY`: recifra todo lo sellado (`LLAVE_VIEJA=… LLAVE_NUEVA=…`). |
| `node scripts/rellenar-totales.mjs` | Una sola vez, para rellenar `total`/`moneda` de comprobantes emitidos antes de que se guardaran esas columnas. Acepta `--dry-run`. |

### Dónde mirar primero

- Nuevo endpoint o cambio de comportamiento visible → actualizar
  [REQUIREMENTS.md](./REQUIREMENTS.md) (Estado + Notas) en la misma sesión.
- Nuevo archivo/export/ruta → actualizar [PROJECT_MAP.md](./PROJECT_MAP.md).
- Guías de uso más largas (paso a paso de conexión con Hacienda, referencia de
  API, despliegue) siguen viviendo en [`docs/`](./docs/README.md).
