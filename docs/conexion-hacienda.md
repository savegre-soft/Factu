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
3. **Código de actividad económica** del emisor: 6 caracteres. Desde TRIBU-CR el
   catálogo es CIIU4 y viene con punto (`8549.0`, tal cual lo devuelve `/fe/ae`
   del RUT); también se aceptan los CIIU3 viejos de 6 dígitos (`620100`).

> ⚠️ Empieza SIEMPRE en el ambiente de **pruebas (`stag`)**. No uses producción
> hasta validar todo el flujo.

## 2. Configurar el entorno

Con una sola variable basta: de `HACIENDA_ENV` se derivan las URLs del IDP y de
recepción y el `client_id` del ambiente (ver [configuración](./configuracion.md)).

```bash
HACIENDA_ENV=stag        # stag → realm rut-stag + api-sandbox · prod → realm rut + api

FACTU_MASTER_KEY="<llave aleatoria para cifrar los secretos en reposo>"
JWT_SECRET="<secreto para firmar los JWT de sesión>"

# Política de firma XAdES-EPES: sin esto Hacienda rechaza con
# "La firma del documento no tiene el Policy Id". .env.example ya trae la
# resolución DGT-R-48-2016 v4.1 — confirma que siga vigente.
HACIENDA_POLICY_URL="..."
HACIENDA_POLICY_HASH="..."
```

> Solo hay que fijar `HACIENDA_IDP_URL`, `HACIENDA_API_URL` o `HACIENDA_CLIENT_ID`
> si Hacienda publica endpoints distintos a los que trae el código.
> `GET /ambiente` muestra la configuración efectiva y si está listo para producción.

## 3. Control de acceso (multi-tenant)

La API es multiusuario: primero creas tu **organización (tenant)** y un usuario, y todas
las peticiones (salvo registro/login) van autenticadas con un **JWT** en la cabecera
`Authorization: Bearer <token>`. Ver [control de acceso](./api.md#control-de-acceso) para
roles y permisos.

```bash
# Crear organización + usuario admin (devuelve el token)
curl -X POST http://localhost:3000/auth/registro \
  -H "Content-Type: application/json" \
  -d '{ "tenantNombre": "Mi Empresa", "email": "admin@miempresa.cr", "nombre": "Admin", "password": "unaClaveSegura" }'
# → { "token": "eyJ...", "usuario": { ... } }

# (o, si ya tienes usuario)  POST /auth/login  → { "token": "..." }

export TOKEN="eyJ..."   # usa el token en las siguientes llamadas
```

## 4. El flujo, paso a paso

```
┌──────────────┐   ┌─────────────────┐   ┌───────────┐   ┌───────────────────┐
│ 1. Registrar │ → │ 2. Subir cert   │ → │ 3. Login  │ → │ 4. Emitir         │
│    emisor    │   │    .p12 (cifra) │   │ (Hacienda)│   │  (firma + envío)  │
└──────────────┘   └─────────────────┘   └───────────┘   └───────────────────┘
                                                                   │
                                                          ┌────────▼────────┐
                                                          │ 5. Estado       │
                                                          │  aceptado/rech. │
                                                          └─────────────────┘
```

> Todas las llamadas llevan `-H "Authorization: Bearer $TOKEN"`.

### Paso 1 — Registrar el emisor  *(rol admin)*

```bash
curl -X POST http://localhost:3000/emisor \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "cedula": "3101123456", "nombre": "Empresa X S.A." }'
```

### Paso 2 — Subir el certificado `.p12`  *(rol admin)*

El `.p12` se envía en **base64** y se guarda **cifrado en reposo** (AES-256-GCM).
Factu valida el `.p12` y el PIN al recibirlo.

```bash
# Codificar el .p12 a base64:
#   Linux/macOS:  base64 -w0 certificado.p12
#   PowerShell:   [Convert]::ToBase64String([IO.File]::ReadAllBytes("certificado.p12"))

curl -X POST http://localhost:3000/emisor/3101123456/certificado \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "p12Base64": "<...base64...>", "password": "<PIN del .p12>" }'
```

> Si un emisor no tiene certificado cargado, la emisión firma con uno **autofirmado
> de prueba** y lo indica en la respuesta (`certificadoDemo: true`). Hacienda solo
> acepta el certificado real, así que en producción este paso es obligatorio.

### Paso 3 — Autenticarse ante el IDP de Hacienda  *(rol facturador+)*

Guarda los tokens de Hacienda bajo la cédula del emisor. Factu los **renueva automáticamente**.

```bash
curl -X POST http://localhost:3000/hacienda/login \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "emisor": "3101123456", "username": "<usuario Hacienda>", "password": "<clave Hacienda>" }'
```

### Paso 4 — Emitir el comprobante  *(rol facturador+)*

El tipo va en la ruta: `factura`, `tiquete`, `nota-credito`, `nota-debito`,
`compra` (factura electrónica de compra, a un no inscrito) o `exportacion`.

El **consecutivo es opcional**: si se omite, la API reserva el siguiente de la
serie (emisor + sucursal + terminal + tipo) de forma atómica. Mandarlo desde el
cliente es un override — una recarga o una segunda pestaña repetirían el número y
Hacienda rechazaría el comprobante. Para mostrarlo en el formulario antes de
emitir, sin consumirlo:

```bash
curl "http://localhost:3000/comprobante/proximo-consecutivo?cedulaEmisor=3101123456&tipo=factura" \
  -H "Authorization: Bearer $TOKEN"
# → { "consecutivo": 42 }
```

```bash
curl -X POST http://localhost:3000/comprobante/factura/enviar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "cedulaEmisor": "3101123456",
    "codigoActividadEmisor": "8549.0",
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

La emisión espera el estado final unos 15 segundos (5 intentos × 3 s). Puedes
consultar el comprobante persistido en cualquier momento:

```bash
curl http://localhost:3000/comprobante/<clave> -H "Authorization: Bearer $TOKEN"
```

Si Hacienda tardó más que esa ventana, el comprobante queda en `recibido` o
`procesando` y **el poller de re-consulta lo retoma solo** (`RECONSULTA_MINUTOS`,
10 min por defecto): al llegar el veredicto actualiza el estado y dispara lo mismo
que habría disparado la emisión — webhook, notificación y entrega al cliente.

## Recibo Electrónico de Pago (REP)

Nuevo en la v4.4: quien facturó **a crédito** debe emitirlo cuando recibe el pago.
Sigue el mismo camino (clave → XML → firma → envío → estado), tiene su propia
serie de consecutivos, y `informacionReferencia` es **obligatoria** — identifica la
factura que se está cobrando.

```bash
curl -X POST http://localhost:3000/recibo-pago/enviar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "cedulaEmisor": "3101123456",
    "emisor": { "nombre": "Empresa X S.A.",
      "identificacion": { "tipo": "02", "numero": "3101123456" },
      "correoElectronico": "facturas@empresa.cr" },
    "receptor": { "nombre": "Cliente Y",
      "identificacion": { "tipo": "01", "numero": "102340567" } },
    "lineas": [ { "detalle": "Abono factura 0001", "montoTotal": 1000,
      "impuestos": [{ "codigo": "01", "codigoTarifa": "08", "tarifa": 13, "monto": 130 }] } ],
    "mediosPago": [ { "tipo": "01" } ],
    "informacionReferencia": [
      { "tipoDoc": "01", "numero": "<clave de 50 díg. de la factura cobrada>",
        "fechaEmision": "2026-08-01T12:00:00-06:00", "codigo": "99", "razon": "Cobro de factura a crédito" } ]
  }'
```

> A diferencia de la factura, el emisor y el receptor van **sin ubicación ni
> teléfono**, no hay código de actividad, y la línea no lleva CABYS ni cantidad: lo
> que se documenta es un monto cobrado, no una venta. El correo del emisor sí es
> obligatorio.

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

Sobre un documento que Factu ya registró como recibido (carga manual, buzón IMAP o
routing interno), el flujo completo es generar **y enviar**: responder es una
obligación con plazo, y generar el XML sin mandarlo no cumple nada.

```bash
curl -X POST http://localhost:3000/recibidos/<id>/mensaje-receptor \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "respuesta": "1" }'   # 1=aceptado, 2=aceptado parcial, 3=rechazado

curl -X POST http://localhost:3000/recibidos/<id>/mensaje-receptor/enviar \
  -H "Authorization: Bearer $TOKEN"
```

## Pendientes para producción

- **Prueba end-to-end contra el sandbox real** de Hacienda, con credenciales y
  certificado reales. Es lo único que falta del flujo de emisión.
- **Validación XSD**: validar el XML contra el esquema oficial de Hacienda.
- **Política de firma**: confirmar que la resolución que trae `.env.example`
  (DGT-R-48-2016 v4.1) sigue siendo la vigente.
