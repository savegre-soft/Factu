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
    factura/     Modelo, cálculo de totales y generación del XML v4.4
  routes/        Endpoints HTTP (Fastify): /clave, /auth/*, /factura/xml
  services/      auth/ (Hacienda IDP); próximamente firma y envío
  infra/         (próximamente) cliente Prisma, cliente HTTP de Hacienda
prisma/
  schema.prisma  Modelo de datos
```

## Roadmap (hitos)

- [x] **1. Clave numérica** — generador de clave de 50 dígitos + consecutivo (con tests)
- [x] **2. Autenticación** — OAuth contra el IDP de Hacienda (login/refresh/logout) + gestor de tokens con renovación automática
- [x] **3. Generación de XML** — Factura Electrónica v4.4: modelo de dominio, cálculo de totales (gravado/exento, desglose de impuestos) y generación del XML sin firmar
- [ ] **4. Firma XAdES-BES** — firmar el XML con el certificado `.p12`
- [ ] **5. Envío y consulta** — POST a recepción + polling de estado
- [ ] **6. Documentos restantes** — Tiquete, Notas de Crédito/Débito, Mensaje Receptor

> ⚠️ Prueba **siempre** contra el ambiente de sandbox/staging de Hacienda antes de producción.
> Nunca subas certificados `.p12`, llaves ni PINs al repositorio (ya están en `.gitignore`).

## Licencia

El proyecto original es AGPL v3. Si reutilizas su código, revisá las obligaciones de esa licencia.
