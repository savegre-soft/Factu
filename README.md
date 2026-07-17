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
cp .env.example .env      # completa los endpoints de Hacienda y FACTU_MASTER_KEY
npm run dev               # servidor en http://localhost:3000
```

Por defecto la persistencia es **en memoria** (no requiere base de datos). Para usar
PostgreSQL, pon `PERSISTENCIA=prisma` y `DATABASE_URL` en `.env`, y ejecuta:

```bash
npm run prisma:generate
npm run prisma:migrate    # requiere PostgreSQL corriendo
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
    validacion/  Validación de reglas de negocio previa al envío
  routes/        Endpoints HTTP: /clave, /auth/*, /emisor/*, /factura/xml, /firma/demo,
                 /comprobante/:tipo/enviar, /comprobante/:clave, /mensaje-receptor/xml
  services/      auth/ (IDP), firma/ (certificados + XAdES),
                 hacienda/ (recepción + emisión), emisor/ (almacén de certificados)
  infra/         crypto/ (cifrado en reposo), repos/ (persistencia: memoria + Prisma)
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
- [x] **7. Persistencia y certificados** — repositorios (memoria + Prisma) para emisores y comprobantes, y gestión de certificados `.p12` **cifrados en reposo** (AES-256-GCM); la emisión usa el certificado real del emisor y persiste cada comprobante con su estado
- [x] **8. Validación y XAdES-EPES** — capa de validación de reglas de negocio (formatos, receptor/plazo/moneda, referencias en notas) que falla antes de enviar, y firma **XAdES-EPES** con política de Hacienda configurable

Registrar un emisor y subir su certificado `.p12` (se guarda **cifrado** en reposo):

```bash
curl -X POST http://localhost:3000/emisor \
  -H "Content-Type: application/json" \
  -d '{ "cedula": "3101123456", "nombre": "Empresa X S.A." }'

curl -X POST http://localhost:3000/emisor/3101123456/certificado \
  -H "Content-Type: application/json" \
  -d '{ "p12Base64": "<contenido del .p12 en base64>", "password": "<PIN del .p12>" }'
```

Emitir un comprobante de punta a punta (requiere `/auth/login` previo y `HACIENDA_API_URL`).
El tipo va en la ruta: `factura`, `tiquete`, `nota-credito` o `nota-debito`. Si el emisor
tiene certificado cargado se firma con él; si no, con uno de prueba (`certificadoDemo: true`):

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

### Validación (hito 8)

Hay dos capas antes de enviar a Hacienda:
1. **zod** en las rutas — valida estructura y tipos de la entrada.
2. **Validación de dominio** (`src/domain/validacion`) — reglas de negocio: largo de la
   identificación según el tipo, receptor obligatorio salvo tiquete, plazo de crédito,
   tipo de cambio si la moneda no es CRC, referencia obligatoria en notas, descuentos que no
   superen el monto, tarifas 0–100, CABYS de 13 dígitos, etc. Si algo falla, `/comprobante/:tipo/enviar`
   responde `400` con la lista de `errores` **sin** firmar ni enviar.

### Nota sobre la firma (hitos 4 y 8)

La firma es **XAdES-EPES** cuando se configuran `HACIENDA_POLICY_URL` y `HACIENDA_POLICY_HASH`
(la política de la resolución vigente v4.4 y su digest SHA-256); si no, cae a **XAdES-BES**.
Incluye `SigningTime` y `SigningCertificate`. La ruta `/firma/demo` usa un certificado
**autofirmado de prueba**; en producción se usa el `.p12` real del emisor (subido vía `/emisor/:cedula/certificado`).

> Pendiente para producción: obtener la URL y el digest oficiales de la política de firma, y
> validar el XML contra el **XSD oficial** de Hacienda (requiere los archivos de esquema).

> ⚠️ Prueba **siempre** contra el ambiente de sandbox/staging de Hacienda antes de producción.
> Nunca subas certificados `.p12`, llaves ni PINs al repositorio (ya están en `.gitignore`).

## Licencia

El proyecto original es AGPL v3. Si reutilizas su código, revisá las obligaciones de esa licencia.
