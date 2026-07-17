/**
 * Esquemas OpenAPI (JSON Schema) para documentar las rutas en Swagger.
 *
 * Los cuerpos se declaran de forma permisiva (`additionalProperties: true`, con
 * `required` mínimo) para documentar sin rechazar entradas válidas; la validación
 * real la siguen haciendo zod (estructura) y la capa de dominio (reglas de negocio).
 */

const identificacion = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["01", "02", "03", "04"], description: "01 física, 02 jurídica, 03 DIMEX, 04 NITE" },
    numero: { type: "string", description: "Solo dígitos" },
  },
  required: ["tipo", "numero"],
} as const;

const ubicacion = {
  type: "object",
  properties: {
    provincia: { type: "string" },
    canton: { type: "string" },
    distrito: { type: "string" },
    barrio: { type: "string" },
    otrasSenas: { type: "string" },
  },
  required: ["provincia", "canton", "distrito", "otrasSenas"],
} as const;

const linea = {
  type: "object",
  additionalProperties: true,
  properties: {
    codigoCabys: { type: "string", description: "Código CABYS de 13 dígitos" },
    cantidad: { type: "number" },
    unidadMedida: { type: "string", description: 'Ej. "Unid", "Sp" (servicios)' },
    detalle: { type: "string" },
    precioUnitario: { type: "number" },
    esServicio: { type: "boolean" },
    descuentos: {
      type: "array",
      items: {
        type: "object",
        properties: { monto: { type: "number" }, naturaleza: { type: "string" } },
      },
    },
    impuestos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          codigo: { type: "string", description: "01 = IVA" },
          codigoTarifa: { type: "string", description: '"08" = 13%' },
          tarifa: { type: "number", description: "Porcentaje, ej. 13" },
        },
      },
    },
  },
  required: ["codigoCabys", "cantidad", "unidadMedida", "detalle", "precioUnitario"],
} as const;

const datosComprobante = {
  type: "object",
  additionalProperties: true,
  properties: {
    cedulaEmisor: { type: "string" },
    sucursal: { type: "number", default: 1 },
    terminal: { type: "number", default: 1 },
    consecutivo: { type: "number" },
    codigoActividadEmisor: { type: "string", description: "6 dígitos" },
    codigoActividadReceptor: { type: "string" },
    emisor: {
      type: "object",
      additionalProperties: true,
      properties: {
        nombre: { type: "string" },
        identificacion,
        nombreComercial: { type: "string" },
        ubicacion,
        correoElectronico: { type: "string", format: "email" },
      },
      required: ["nombre", "identificacion", "ubicacion", "correoElectronico"],
    },
    receptor: {
      type: "object",
      additionalProperties: true,
      properties: {
        nombre: { type: "string" },
        identificacion,
        correoElectronico: { type: "string", format: "email" },
      },
    },
    condicionVenta: { type: "string", description: "01 contado, 02 crédito, …", default: "01" },
    plazoCredito: { type: "string" },
    moneda: {
      type: "object",
      properties: { codigo: { type: "string" }, tipoCambio: { type: "number" } },
    },
    lineas: { type: "array", items: linea, minItems: 1 },
    mediosPago: {
      type: "array",
      items: {
        type: "object",
        properties: { tipo: { type: "string" }, monto: { type: "number" } },
      },
    },
    informacionReferencia: {
      type: "array",
      description: "Obligatorio en notas de crédito/débito",
      items: {
        type: "object",
        properties: {
          tipoDoc: { type: "string" },
          numero: { type: "string", description: "Clave de 50 dígitos del documento original" },
          fechaEmision: { type: "string", format: "date-time" },
          codigo: { type: "string" },
          razon: { type: "string" },
        },
      },
    },
  },
  required: ["cedulaEmisor", "consecutivo", "codigoActividadEmisor", "emisor", "lineas"],
} as const;

// ---- Esquemas por ruta ----

export const healthSchema = {
  tags: ["Utilidades"],
  summary: "Estado del servicio",
} as const;

export const claveSchema = {
  tags: ["Utilidades"],
  summary: "Genera la clave numérica de 50 dígitos",
  body: {
    type: "object",
    properties: {
      cedulaEmisor: { type: "string" },
      sucursal: { type: "number" },
      terminal: { type: "number" },
      tipo: { type: "string", enum: ["01", "02", "03", "04", "05", "08", "09"] },
      consecutivo: { type: "number" },
    },
    required: ["cedulaEmisor", "tipo", "consecutivo"],
    additionalProperties: true,
  },
} as const;

const bearer = [{ bearerAuth: [] }];

// --- Autenticación de usuarios ---

export const authRegistroSchema = {
  tags: ["Autenticación"],
  summary: "Crea una organización (tenant) y su usuario administrador",
  body: {
    type: "object",
    properties: {
      tenantNombre: { type: "string", description: "Nombre de la organización" },
      email: { type: "string", format: "email" },
      nombre: { type: "string" },
      password: { type: "string", minLength: 8 },
    },
    required: ["tenantNombre", "email", "nombre", "password"],
  },
} as const;

export const authLoginSchema = {
  tags: ["Autenticación"],
  summary: "Inicia sesión y devuelve un JWT",
  body: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string" },
    },
    required: ["email", "password"],
  },
} as const;

export const authYoSchema = {
  tags: ["Autenticación"],
  summary: "Perfil del usuario autenticado",
  security: bearer,
} as const;

export const crearUsuarioSchema = {
  tags: ["Autenticación"],
  summary: "Crea un usuario en tu organización (solo admin)",
  security: bearer,
  body: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      nombre: { type: "string" },
      password: { type: "string", minLength: 8 },
      rol: { type: "string", enum: ["admin", "facturador", "lector"] },
    },
    required: ["email", "nombre", "password", "rol"],
  },
} as const;

export const listarUsuariosSchema = {
  tags: ["Autenticación"],
  summary: "Lista los usuarios de tu organización (solo admin)",
  security: bearer,
} as const;

// --- Sesión con Hacienda (por emisor) ---

export const haciendaLoginSchema = {
  tags: ["Hacienda"],
  summary: "Inicia sesión contra el IDP de Hacienda para un emisor",
  description: "Requiere JWT con permiso de emisión. El emisor debe ser de tu tenant.",
  security: bearer,
  body: {
    type: "object",
    properties: {
      emisor: { type: "string", description: "Cédula del emisor" },
      username: { type: "string", description: "Usuario de la API de Hacienda" },
      password: { type: "string", description: "Clave de la API de Hacienda" },
    },
    required: ["emisor", "username", "password"],
  },
} as const;

export const haciendaEmisorSchema = {
  tags: ["Hacienda"],
  summary: "Token/logout de la sesión de Hacienda de un emisor",
  security: bearer,
  body: {
    type: "object",
    properties: { emisor: { type: "string" } },
    required: ["emisor"],
  },
} as const;

export const emisorListarSchema = {
  tags: ["Emisores"],
  summary: "Lista los emisores de tu organización",
  security: bearer,
} as const;

export const emisorRegistrarSchema = {
  tags: ["Emisores"],
  summary: "Registra o actualiza un emisor (solo admin)",
  security: bearer,
  body: {
    type: "object",
    properties: { cedula: { type: "string" }, nombre: { type: "string" } },
    required: ["cedula", "nombre"],
  },
} as const;

export const emisorCertificadoSchema = {
  tags: ["Emisores"],
  summary: "Sube el certificado .p12 del emisor (se guarda cifrado en reposo)",
  security: bearer,
  params: {
    type: "object",
    properties: { cedula: { type: "string" } },
    required: ["cedula"],
  },
  body: {
    type: "object",
    properties: {
      p12Base64: { type: "string", description: "Archivo .p12 codificado en base64" },
      password: { type: "string", description: "PIN del .p12" },
    },
    required: ["p12Base64", "password"],
  },
} as const;

export const facturaXmlSchema = {
  tags: ["Comprobantes"],
  summary: "Genera el XML (sin firmar) de una factura",
  body: datosComprobante,
} as const;

export const comprobanteEnviarSchema = {
  tags: ["Comprobantes"],
  summary: "Emite un comprobante de punta a punta (clave → XML → firma → envío → estado)",
  description:
    "Requiere JWT con permiso de emisión y sesión de Hacienda del emisor (POST /hacienda/login). Firma con el certificado real del emisor si está cargado; si no, con uno de prueba (`certificadoDemo: true`).",
  security: bearer,
  params: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["factura", "tiquete", "nota-credito", "nota-debito"] },
    },
    required: ["tipo"],
  },
  body: datosComprobante,
} as const;

export const comprobanteGetSchema = {
  tags: ["Comprobantes"],
  summary: "Consulta un comprobante persistido por su clave",
  security: bearer,
  params: {
    type: "object",
    properties: { clave: { type: "string" } },
    required: ["clave"],
  },
} as const;

export const mensajeReceptorSchema = {
  tags: ["Comprobantes"],
  summary: "Genera el XML de un Mensaje Receptor (aceptación/rechazo)",
  body: {
    type: "object",
    additionalProperties: true,
    properties: {
      clave: { type: "string", description: "Clave de 50 dígitos del comprobante recibido" },
      numeroCedulaEmisor: { type: "string" },
      fechaEmisionDoc: { type: "string", format: "date-time" },
      mensaje: { type: "string", enum: ["1", "2", "3"], description: "1 aceptado, 2 parcial, 3 rechazado" },
      detalleMensaje: { type: "string" },
      montoTotalImpuesto: { type: "number" },
      totalFactura: { type: "number" },
      numeroCedulaReceptor: { type: "string" },
      numeroConsecutivoReceptor: { type: "string", description: "20 dígitos" },
    },
    required: ["clave", "numeroCedulaEmisor", "fechaEmisionDoc", "mensaje", "totalFactura", "numeroCedulaReceptor", "numeroConsecutivoReceptor"],
  },
} as const;

export const firmaDemoSchema = {
  tags: ["Firma"],
  summary: "DEMO: firma un XML con un certificado autofirmado de prueba",
  body: {
    type: "object",
    properties: { xml: { type: "string" } },
    required: ["xml"],
  },
} as const;
