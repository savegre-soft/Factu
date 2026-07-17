# Factu

API de **facturación electrónica** para el Ministerio de Hacienda de Costa Rica
(comprobantes electrónicos **v4.4**), escrita en **TypeScript + Node**.

Cubre el ciclo completo: registro de emisor, carga de certificado, autenticación,
generación y firma XAdES del XML, envío a Hacienda y consulta de estado. Soporta
**Factura, Tiquete, Nota de Crédito, Nota de Débito y Mensaje Receptor**.

Inspirado en [CRLibre/API_Hacienda](https://github.com/CRLibre/API_Hacienda) (PHP),
reescrito con un stack moderno de Node.

## Stack

- **Node ≥ 20** + **TypeScript** (ESM, modo estricto)
- **Fastify** — servidor HTTP · **@fastify/swagger** — documentación OpenAPI
- **Prisma** + **PostgreSQL** — persistencia (o backend en memoria)
- **xmlbuilder2** — generación de XML · **xadesjs** — firma XAdES
- **node-forge** — certificados `.p12` · **zod** — validación
- **Vitest** — tests

## Inicio rápido

```bash
npm install
cp .env.example .env      # completa FACTU_MASTER_KEY y los endpoints de Hacienda
npm run dev               # API en http://localhost:3000
```

- **Documentación interactiva (Swagger):** http://localhost:3000/docs
- Persistencia **en memoria** por defecto (sin base de datos).

### Con Docker (API + PostgreSQL)

```bash
docker compose up --build
```

## Documentación

La guía completa está en [`docs/`](./docs/README.md):

- [Primeros pasos](./docs/primeros-pasos.md)
- [**Conexión con Hacienda**](./docs/conexion-hacienda.md) — el flujo completo, paso a paso
- [Configuración](./docs/configuracion.md) — variables de entorno
- [Referencia de la API](./docs/api.md) — endpoints y Swagger
- [Despliegue](./docs/despliegue.md) — Docker y producción

## El flujo en un vistazo

```
Registrar emisor → Subir .p12 (cifrado) → Login (IDP) →
Emitir: clave → XML → firma XAdES → envío → estado
```

```bash
# 1) Registrar emisor y subir su certificado
curl -X POST http://localhost:3000/emisor \
  -H "Content-Type: application/json" \
  -d '{ "cedula": "3101123456", "nombre": "Empresa X S.A." }'

curl -X POST http://localhost:3000/emisor/3101123456/certificado \
  -H "Content-Type: application/json" \
  -d '{ "p12Base64": "<.p12 en base64>", "password": "<PIN>" }'

# 2) Autenticar contra el IDP de Hacienda
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "emisor": "3101123456", "username": "<usuario>", "password": "<clave>" }'

# 3) Emitir (factura | tiquete | nota-credito | nota-debito)
curl -X POST http://localhost:3000/comprobante/factura/enviar \
  -H "Content-Type: application/json" \
  -d '{ "cedulaEmisor": "3101123456", "consecutivo": 1, "codigoActividadEmisor": "620100",
        "emisor": { "nombre": "Empresa X S.A.", "identificacion": { "tipo": "02", "numero": "3101123456" },
          "ubicacion": { "provincia": "1", "canton": "01", "distrito": "01", "otrasSenas": "Centro" },
          "correoElectronico": "facturas@empresa.cr" },
        "receptor": { "nombre": "Cliente Y", "identificacion": { "tipo": "01", "numero": "102340567" } },
        "lineas": [ { "codigoCabys": "8399000000000", "cantidad": 1, "unidadMedida": "Unid",
          "detalle": "Producto A", "precioUnitario": 1000,
          "impuestos": [{ "codigo": "01", "codigoTarifa": "08", "tarifa": 13 }] } ] }'
# → { tipo, clave, consecutivo, envio: { status: 202 }, estado: "aceptado" | "rechazado", ... }
```

Detalle completo (notas de crédito/débito, mensaje receptor, validación) en la
[guía de conexión](./docs/conexion-hacienda.md).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor en desarrollo (recarga en caliente). |
| `npm test` | Suite de tests (Vitest). |
| `npm run typecheck` | Chequeo de tipos. |
| `npm run build` / `npm start` | Compila / ejecuta la versión compilada. |
| `npm run prisma:generate` / `npm run prisma:migrate` | Cliente / migraciones Prisma. |

## Estructura

```
src/
  config/        Configuración y variables de entorno (env.ts)
  domain/        Lógica de negocio pura (sin infraestructura)
    clave/       Clave numérica (50 díg.) y consecutivo (20 díg.)
    factura/     Modelo, totales y generador de XML v4.4 (Factura/Tiquete/Notas)
    mensajeReceptor/  Generador del XML de Mensaje Receptor
    validacion/  Reglas de negocio previas al envío
  services/      auth/ (IDP), firma/ (certificados + XAdES),
                 hacienda/ (recepción + emisión), emisor/ (almacén de certificados)
  infra/         crypto/ (cifrado en reposo), repos/ (persistencia: memoria + Prisma)
  plugins/       Swagger y esquemas OpenAPI
  routes/        Endpoints HTTP (Fastify)
  server.ts      buildServer() · main.ts  entrypoint
prisma/
  schema.prisma  Modelo de datos
docs/            Documentación del proyecto
```

## Roadmap

- [x] **1. Clave numérica** — clave de 50 dígitos + consecutivo.
- [x] **2. Autenticación** — OAuth contra el IDP de Hacienda + renovación automática de tokens.
- [x] **3. Generación de XML** — Factura v4.4: modelo, totales (gravado/exento, desglose) y XML.
- [x] **4. Firma XAdES** — carga de `.p12` y firma XAdES enveloped verificable.
- [x] **5. Envío y consulta** — sobre base64, `POST /recepcion`, estado con polling y orquestador de emisión.
- [x] **6. Documentos** — Factura, Tiquete, Notas (con `InformacionReferencia`) y Mensaje Receptor.
- [x] **7. Persistencia y certificados** — repos (memoria + Prisma) y `.p12` **cifrado en reposo** (AES-256-GCM).
- [x] **8. Validación y XAdES-EPES** — validación de reglas de negocio y firma con política configurable.
- [x] **9. Documentación e infra** — Swagger en `/docs`, guías en `docs/`, GitHub Actions y Docker.

### Pendiente para producción

- Datos oficiales de la **política de firma** (`HACIENDA_POLICY_URL` + `HACIENDA_POLICY_HASH`) para XAdES-EPES.
- Validación contra el **XSD oficial** v4.4 (requiere los archivos de esquema de Hacienda).
- **URLs oficiales** del IDP y de recepción, y pruebas contra el sandbox real.

> ⚠️ Prueba **siempre** contra el ambiente de sandbox/`stag` antes de producción.
> Nunca subas certificados `.p12`, llaves ni PINs al repositorio (ya están en `.gitignore`).

## Licencia

El proyecto original es AGPL v3. Si reutilizas su código, revisá las obligaciones de esa licencia.
