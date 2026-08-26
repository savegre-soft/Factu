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
  débito. El sistema arma el documento, lo firma digitalmente y lo envía a
  Hacienda, esperando la confirmación de que fue **aceptado** o avisando si fue
  **rechazado** (y por qué).
- **Guardar avances**: si estás llenando una factura y no la terminás, queda
  como **borrador** para retomarla después.
- **Recordar a tus clientes**: una vez que facturaste a alguien, la próxima vez
  el sistema te sugiere sus datos automáticamente.
- **Entregar la factura**: le manda automáticamente a tu cliente un correo con
  el comprobante (PDF + XML), y lleva un historial de esos envíos por si hay
  que reenviar alguno.
- **Recibir facturas de tus proveedores**: podés cargar manualmente los
  comprobantes que te envían, o conectar tu buzón de correo para que el
  sistema los detecte solo. Con eso generás la respuesta de aceptación o
  rechazo (el "mensaje receptor") que exige Hacienda.
- **Organizaciones y usuarios**: cada empresa (organización) tiene sus propios
  usuarios con distintos permisos — quién puede solo consultar, quién puede
  facturar, y quién además administra usuarios y certificados.
- **Iniciar sesión con Google o Microsoft**, además del usuario y contraseña
  propios de Factu, y recuperar la contraseña si la olvidás.
- **Estadísticas**: cuánto facturaste, cuántos comprobantes fueron aceptados o
  rechazados, y cómo evoluciona en el tiempo.
- **Conectar con otros sistemas**:
  - **Integraciones vía API key**: para que tu ERP o sistema de ventas emita
    facturas directamente, sin pasar por la pantalla de Factu.
  - **Webhooks**: para avisarle a otro sistema tuyo cada vez que pasa algo
    (ej. "se aceptó una factura").
  - **Notificaciones**: avisos por SMS, WhatsApp, Slack o Teams cuando ocurren
    ciertos eventos.
- **Auditoría**: queda registrado quién hizo qué y cuándo (quién emitió, quién
  creó un usuario, quién cambió una configuración), para poder revisarlo
  después.
- **Chat interno**: los usuarios de una misma organización se pueden escribir
  entre sí dentro del sistema.
- **Panel interno de Savegre** (2026-08-25/26): además de la app de
  facturación, Factu expone un canal de solo-servicio (`/plataforma/*`,
  credencial propia, separada de las cuentas de las organizaciones) para que
  **Savegre Center** — el panel interno donde Savegre Soft administra todos
  sus productos (RestroCloud, Factu, Wapi) desde un solo lugar — pueda ver
  los tenants de Factu y gestionar su suscripción/cobro, igual que ya hace
  con RestroCloud.

### Qué falta para producción real

Hoy el sistema funciona de punta a punta contra un ambiente de **pruebas**
(sandbox). Antes de facturar de verdad a clientes reales, falta:

- Confirmar con Hacienda las direcciones oficiales de conexión (de pruebas y
  de producción).
- Cargar los datos oficiales de la "política de firma" vigente que exige
  Hacienda para la firma digital reforzada (hoy usa la firma básica, que es
  válida pero no la reforzada que Hacienda pide en producción).
- Validar que cada factura cumple exactamente el formato que Hacienda espera
  (hoy se validan las reglas de negocio, falta el chequeo formal contra su
  plantilla oficial).
- Que el propio sistema lleve el número consecutivo de cada empresa (hoy ese
  número lo tiene que indicar quien factura).

Ver el detalle fila por fila en [REQUIREMENTS.md](./REQUIREMENTS.md).

---

## Parte 2 — Para el desarrollador

### Stack

| Capa | Herramienta |
|---|---|
| Runtime | Node ≥ 20 · TypeScript (ESM, estricto) |
| HTTP | Fastify 5 · `@fastify/swagger` |
| Persistencia | Prisma + PostgreSQL, o backend en memoria (`PERSISTENCIA=memoria`) |
| XML | xmlbuilder2 |
| Firma | xadesjs · node-forge (certificados `.p12`) |
| Validación | zod (esquemas HTTP) + validación de dominio (reglas de negocio) |
| Auth | `@fastify/jwt` · scrypt (multi-tenant + roles) |
| Correo | nodemailer (saliente/SMTP) · imapflow + mailparser (entrante/IMAP) |
| PDF | pdfkit |
| Docs | Scalar · Swagger UI · OpenAPI |
| Tests | Vitest |

### Cómo correr el proyecto

```bash
# Local, sin base de datos (persistencia en memoria)
npm install
cp .env.example .env
npm run dev                 # http://localhost:3001 · docs en /docs

# Con Docker (API + PostgreSQL)
docker compose up --build
```

Otros scripts: `npm test` (Vitest), `npm run typecheck`, `npm run build`,
`npm start` (versión compilada). Variables de entorno completas en
[docs/configuracion.md](./docs/configuracion.md).

### Arquitectura, en breve

```
src/
├── config/        Variables de entorno tipadas (zod) + config de Hacienda
├── domain/        Lógica de negocio PURA (sin infraestructura, 100% testeable)
│   ├── clave/          Clave numérica (50 díg.) y consecutivo
│   ├── factura/        Modelo, totales y generador de XML v4.4
│   ├── mensajeReceptor/ XML de Mensaje Receptor
│   ├── documentoRecibido/ Parseo de comprobantes recibidos
│   ├── validacion/     Reglas de negocio previas al envío
│   └── auth/           Roles y permisos
├── services/      Casos de uso e integraciones (inyectan sus dependencias)
│   ├── auth/, cuentas/, usuarios/     Sesión Hacienda, OAuth, password reset
│   ├── emisor/, firma/                Certificados .p12 + firma XAdES
│   ├── hacienda/                      Envío a recepción + consulta de estado
│   ├── borradores/, apiKeys/          Borradores de emisión, API keys
│   ├── correo/, entrega/              Correo entrante (IMAP) y saliente (SMTP + PDF)
│   ├── documentosRecibidos/           Documentos que la empresa recibió
│   ├── webhooks/, notificaciones/     Integraciones salientes
│   ├── estadisticas/, auditoria/, logs/ Reportes y observabilidad
│   └── chat/                          Mensajería interna
├── infra/         crypto/ (cifrado AES-256-GCM) · repos/ (memoria + Prisma)
├── plugins/       Swagger/OpenAPI y esquemas
├── routes/        Endpoints HTTP (Fastify) — un archivo por área
└── main.ts        Entrypoint: arranca el server + los pollers en background
```

El dominio no depende de nada externo. Los pollers (`services/*/poller.ts`)
corren en segundo plano desde `main.ts` para: correo entrante, reintentos de
entrega al cliente, reintentos de webhooks y reintentos de notificaciones.

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
- **Secretos**: cualquier credencial (`.p12`, contraseñas SMTP/IMAP, secretos
  de webhook, config de canales de notificación) se guarda cifrada con
  `src/infra/crypto/secretBox.ts` (`SecretoSellado`), nunca en claro.
- **Rutas**: un archivo por área de negocio en `src/routes/`, registrado en
  `src/server.ts`. Los guards de rol/permiso viven en `src/routes/_guards.ts`.
- **Tests**: Vitest, un `*.test.ts` junto al archivo que prueba.

### Dónde mirar primero

- Nuevo endpoint o cambio de comportamiento visible → actualizar
  [REQUIREMENTS.md](./REQUIREMENTS.md) (Estado + Notas) en la misma sesión.
- Nuevo archivo/export/ruta → actualizar [PROJECT_MAP.md](./PROJECT_MAP.md).
- Guías de uso más largas (paso a paso de conexión con Hacienda, referencia de
  API, despliegue) siguen viviendo en [`docs/`](./docs/README.md).
