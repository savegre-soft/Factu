# Factu

API de **facturación electrónica** para el Ministerio de Hacienda de Costa Rica (comprobantes electrónicos v4.4), escrita en **TypeScript + Node**.

## Stack

- **Node** + **TypeScript** (ESM, modo estricto)
- **Fastify** — servidor HTTP
- **Prisma** + **PostgreSQL** — persistencia
- **xmlbuilder2** — generación de XML
- **zod** — validación de entrada
- **Vitest** — tests

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completa DATABASE_URL y los endpoints de Hacienda
npm run prisma:generate
npm run prisma:migrate    # requiere PostgreSQL corriendo
npm run dev               # servidor en http://localhost:3000
```

Prueba rápida:

```bash
curl http://localhost:3000/health

curl -X POST http://localhost:3000/clave \
  -H "Content-Type: application/json" \
  -d '{"cedulaEmisor":"3101123456","sucursal":1,"terminal":1,"tipo":"01","consecutivo":1}'
```

Autenticación (requiere credenciales del ambiente `stag` de Hacienda en `.env`):

```bash
# Login: cachea los tokens bajo la clave "emisor"
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emisor":"3101123456","username":"USUARIO_HACIENDA","password":"CLAVE_HACIENDA"}'

# Obtener un access token válido (renueva solo si hace falta)
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" -d '{"emisor":"3101123456"}'
```

Generar el XML de una factura (genera clave + XML, sin firmar):

```bash
curl -X POST http://localhost:3000/factura/xml \
  -H "Content-Type: application/json" \
  -d '{
    "cedulaEmisor": "3101123456",
    "consecutivo": 1,
    "codigoActividadEmisor": "620100",
    "emisor": {
      "nombre": "Empresa X S.A.",
      "identificacion": { "tipo": "02", "numero": "3101123456" },
      "ubicacion": { "provincia": "1", "canton": "01", "distrito": "01", "otrasSenas": "Centro" },
      "correoElectronico": "facturas@empresa.cr"
    },
    "lineas": [
      { "codigoCabys": "8399000000000", "cantidad": 2, "unidadMedida": "Unid",
        "detalle": "Producto A", "precioUnitario": 1000,
        "impuestos": [{ "codigo": "01", "codigoTarifa": "08", "tarifa": 13 }] }
    ]
  }'
```

## Tests

```bash
npm test
```

## Estructura

```
src/
  config/        Configuración y variables de entorno (env.ts)
  domain/        Lógica de negocio pura, sin dependencias de infraestructura
    clave/       Generación de clave numérica (50 díg.) y consecutivo (20 díg.)
    factura/     Modelo, totales y generador de XML v4.4 (Factura/Tiquete/Notas)
    mensajeReceptor/  Generador del XML de Mensaje Receptor
  routes/        Endpoints HTTP: /clave, /auth/*, /factura/xml, /firma/demo,
                 /comprobante/:tipo/enviar, /mensaje-receptor/xml
  services/      auth/ (IDP), firma/ (certificados + XAdES), hacienda/ (recepción + emisión)
  infra/         (próximamente) cliente Prisma, cliente HTTP de Hacienda
prisma/
  schema.prisma  Modelo de datos
```

## Roadmap (hitos)

- [x] **1. Clave numérica** — generador de clave de 50 dígitos + consecutivo (con tests)
- [x] **2. Autenticación** — OAuth contra el IDP de Hacienda (login/refresh/logout) + gestor de tokens con renovación automática
- [x] **3. Generación de XML** — Factura Electrónica v4.4: modelo de dominio, cálculo de totales (gravado/exento, desglose de impuestos) y generación del XML sin firmar
- [x] **4. Firma XAdES-BES** — carga de `.p12` (o certificado autofirmado de prueba) y firma XAdES enveloped verificable (SigningTime + SigningCertificate)
- [x] **5. Envío y consulta** — sobre de recepción (base64), cliente `POST /recepcion` + consulta de estado con polling, y orquestador de emisión de punta a punta (`clave → XML → firma → envío → estado`)
- [x] **6. Documentos restantes** — generador de XML generalizado (Factura, Tiquete, Notas de Crédito/Débito con `InformacionReferencia`) y Mensaje Receptor (aceptación/rechazo de comprobantes recibidos)

Emitir un comprobante de punta a punta (requiere `/auth/login` previo y `HACIENDA_API_URL`).
El tipo va en la ruta: `factura`, `tiquete`, `nota-credito` o `nota-debito`:

```bash
curl -X POST http://localhost:3000/comprobante/factura/enviar \
  -H "Content-Type: application/json" \
  -d '{
    "cedulaEmisor": "3101123456", "consecutivo": 1, "codigoActividadEmisor": "620100",
    "emisor": { "nombre": "Empresa X S.A.", "identificacion": { "tipo": "02", "numero": "3101123456" },
      "ubicacion": { "provincia": "1", "canton": "01", "distrito": "01", "otrasSenas": "Centro" },
      "correoElectronico": "facturas@empresa.cr" },
    "receptor": { "nombre": "Cliente Y", "identificacion": { "tipo": "01", "numero": "102340567" } },
    "lineas": [ { "codigoCabys": "8399000000000", "cantidad": 1, "unidadMedida": "Unid",
      "detalle": "Producto A", "precioUnitario": 1000,
      "impuestos": [{ "codigo": "01", "codigoTarifa": "08", "tarifa": 13 }] } ]
  }'
# → { tipo, clave, consecutivo, envio: { status: 202 }, estado: "aceptado" | "rechazado", respuestaXml }
```

Las **notas de crédito/débito** exigen `informacionReferencia` (qué documento corrigen y por qué):

```bash
curl -X POST http://localhost:3000/comprobante/nota-credito/enviar \
  -H "Content-Type: application/json" \
  -d '{ ...mismos campos que la factura...,
    "informacionReferencia": [
      { "tipoDoc": "01", "numero": "<clave de 50 díg. del documento original>",
        "fechaEmision": "2026-07-10T12:00:00-06:00", "codigo": "01", "razon": "Anulación por error" }
    ]
  }'
```

Mensaje Receptor (aceptar/rechazar un comprobante recibido) — genera el XML:

```bash
curl -X POST http://localhost:3000/mensaje-receptor/xml \
  -H "Content-Type: application/json" \
  -d '{ "clave": "<clave de 50 díg.>", "numeroCedulaEmisor": "3101123456",
    "fechaEmisionDoc": "2026-07-16T12:00:00-06:00", "mensaje": "1", "totalFactura": 1130,
    "montoTotalImpuesto": 130, "numeroCedulaReceptor": "102340567",
    "numeroConsecutivoReceptor": "00100001050000000001" }'
# mensaje: 1=aceptado, 2=aceptado parcial, 3=rechazado
```

### Nota sobre la firma (hito 4)

La firma actual es **XAdES-BES** (incluye `SigningTime` y `SigningCertificate`). Hacienda
exige el perfil **XAdES-EPES**, que añade una `SignaturePolicyIdentifier` con el OID/URL de
la política de resolución vigente. El firmador ya soporta pasarla (`opts.policy` de xadesjs);
falta el dato oficial. La ruta `/firma/demo` usa un certificado **autofirmado de prueba**;
en producción se usará el `.p12` real del emisor.

> ⚠️ Prueba **siempre** contra el ambiente de sandbox/staging de Hacienda antes de producción.
> Nunca subas certificados `.p12`, llaves ni PINs al repositorio (ya están en `.gitignore`).

## Licencia

El proyecto original es AGPL v3. Si reutilizas su código, revisá las obligaciones de esa licencia.
