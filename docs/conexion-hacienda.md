# Conexión con Hacienda

Esta es la guía principal: cómo conectar Factu con el Ministerio de Hacienda de
Costa Rica y emitir un comprobante de punta a punta.

## 1. Qué necesitas de Hacienda

Antes de empezar, cada emisor debe tramitar ante Hacienda (portal ATV):

1. **Certificado de firma digital (`.p12`)** — la llave criptográfica que Hacienda
   emite para el contribuyente, junto con su **PIN**.
2. **Credenciales de la API** — un **usuario** y **clave** del ambiente que uses
   (pruebas/`stag` o producción/`prod`). Se generan en el portal de Hacienda al
   registrar la API de comprobantes.
3. **Código de actividad económica** del emisor (6 dígitos).

> ⚠️ Empieza SIEMPRE en el ambiente de **pruebas (`stag`)**. No uses producción
> hasta validar todo el flujo.

## 2. Configurar el entorno

En tu `.env` (ver [configuración](./configuracion.md) para el detalle):

```bash
HACIENDA_ENV=stag
HACIENDA_IDP_URL="<endpoint de token del IDP de Hacienda (stag)>"
HACIENDA_API_URL="<URL base de recepción de comprobantes (stag)>"
HACIENDA_CLIENT_ID=api-stag

FACTU_MASTER_KEY="<llave aleatoria para cifrar los .p12 en reposo>"
```

> Las URLs exactas del IDP y de recepción las publica Hacienda en su documentación
> técnica oficial. Las de `.env.example` son de referencia y **debes confirmarlas**.

## 3. El flujo, paso a paso

```
┌──────────────┐   ┌─────────────────┐   ┌───────────┐   ┌───────────────────┐
│ 1. Registrar │ → │ 2. Subir cert   │ → │ 3. Login  │ → │ 4. Emitir         │
│    emisor    │   │    .p12 (cifra) │   │   (IDP)   │   │  (firma + envío)  │
└──────────────┘   └─────────────────┘   └───────────┘   └───────────────────┘
                                                                   │
                                                          ┌────────▼────────┐
                                                          │ 5. Estado       │
                                                          │  aceptado/rech. │
                                                          └─────────────────┘
```

Internamente, el paso 4 hace: **generar clave (50 díg.) → generar XML v4.4 →
firmar XAdES → codificar en base64 → `POST /recepcion` → consultar estado**.

### Paso 1 — Registrar el emisor

```bash
curl -X POST http://localhost:3000/emisor \
  -H "Content-Type: application/json" \
  -d '{ "cedula": "3101123456", "nombre": "Empresa X S.A." }'
```

### Paso 2 — Subir el certificado `.p12`

El `.p12` se envía en **base64** y se guarda **cifrado en reposo** (AES-256-GCM).
Factu valida el `.p12` y el PIN al recibirlo.

```bash
# Codificar el .p12 a base64:
#   Linux/macOS:  base64 -w0 certificado.p12
#   PowerShell:   [Convert]::ToBase64String([IO.File]::ReadAllBytes("certificado.p12"))

curl -X POST http://localhost:3000/emisor/3101123456/certificado \
  -H "Content-Type: application/json" \
  -d '{ "p12Base64": "<...base64...>", "password": "<PIN del .p12>" }'
```

> Si un emisor no tiene certificado cargado, la emisión firma con uno **autofirmado
> de prueba** y lo indica en la respuesta (`certificadoDemo: true`). Hacienda solo
> acepta el certificado real, así que en producción este paso es obligatorio.

### Paso 3 — Autenticarse (IDP de Hacienda)

Guarda los tokens bajo la cédula del emisor. Factu los **renueva automáticamente**.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "emisor": "3101123456", "username": "<usuario Hacienda>", "password": "<clave Hacienda>" }'
```

### Paso 4 — Emitir el comprobante

El tipo va en la ruta: `factura`, `tiquete`, `nota-credito` o `nota-debito`.

```bash
curl -X POST http://localhost:3000/comprobante/factura/enviar \
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
    "receptor": {
      "nombre": "Cliente Y",
      "identificacion": { "tipo": "01", "numero": "102340567" }
    },
    "lineas": [
      { "codigoCabys": "8399000000000", "cantidad": 1, "unidadMedida": "Unid",
        "detalle": "Producto A", "precioUnitario": 1000,
        "impuestos": [{ "codigo": "01", "codigoTarifa": "08", "tarifa": 13 }] }
    ]
  }'
```

Respuesta:

```json
{
  "tipo": "factura",
  "clave": "506...50 dígitos...",
  "consecutivo": "00100001010000000001",
  "envio": { "status": 202 },
  "estado": "aceptado",
  "respuestaXml": "<MensajeHacienda>...</MensajeHacienda>",
  "certificadoDemo": false
}
```

Las **notas de crédito/débito** exigen `informacionReferencia` (qué documento
corrigen y por qué):

```json
"informacionReferencia": [
  { "tipoDoc": "01", "numero": "<clave de 50 díg. del documento original>",
    "fechaEmision": "2026-07-10T12:00:00-06:00", "codigo": "01", "razon": "Anulación por error" }
]
```

### Paso 5 — Consultar el estado

La emisión ya espera el estado final, pero puedes reconsultar el comprobante
persistido:

```bash
curl http://localhost:3000/comprobante/<clave>
```

## Validación previa

Antes de firmar y enviar, Factu valida las reglas de negocio (formatos, receptor
obligatorio salvo tiquete, plazo de crédito, tipo de cambio si la moneda no es CRC,
referencias en notas, CABYS de 13 dígitos, tarifas 0–100, etc.). Si algo falla,
responde `400` con la lista de `errores` **sin** contactar a Hacienda.

## Mensaje Receptor

Para **aceptar o rechazar** un comprobante que recibiste, genera su XML:

```bash
curl -X POST http://localhost:3000/mensaje-receptor/xml \
  -H "Content-Type: application/json" \
  -d '{ "clave": "<clave de 50 díg.>", "numeroCedulaEmisor": "3101123456",
    "fechaEmisionDoc": "2026-07-16T12:00:00-06:00", "mensaje": "1", "totalFactura": 1130,
    "montoTotalImpuesto": 130, "numeroCedulaReceptor": "102340567",
    "numeroConsecutivoReceptor": "00100001050000000001" }'
# mensaje: 1=aceptado, 2=aceptado parcial, 3=rechazado
```

## Pendientes para producción

- **Política de firma (XAdES-EPES)**: configura `HACIENDA_POLICY_URL` y
  `HACIENDA_POLICY_HASH` con los valores oficiales de la resolución vigente.
- **Validación XSD**: validar el XML contra el esquema oficial de Hacienda.
- **URLs oficiales** del IDP y de recepción del sandbox/producción.
