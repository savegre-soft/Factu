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

const usuarioIdParams = {
  type: "object",
  properties: { id: { type: "string", description: "Id del usuario" } },
  required: ["id"],
} as const;

export const usuarioGetSchema = {
  tags: ["Usuarios"],
  summary: "Consulta un usuario de tu organización (solo admin)",
  security: bearer,
  params: usuarioIdParams,
} as const;

export const actualizarUsuarioSchema = {
  tags: ["Usuarios"],
  summary: "Actualiza el nombre y/o el rol de un usuario (solo admin)",
  description:
    "No permite quitar el rol admin al único administrador de la organización (dejaría al tenant sin quien lo gestione).",
  security: bearer,
  params: usuarioIdParams,
  body: {
    type: "object",
    properties: {
      nombre: { type: "string" },
      rol: { type: "string", enum: ["admin", "facturador", "lector"] },
    },
    minProperties: 1,
  },
} as const;

export const cambiarPasswordSchema = {
  tags: ["Usuarios"],
  summary: "Cambia la contraseña de un usuario de tu organización (solo admin)",
  security: bearer,
  params: usuarioIdParams,
  body: {
    type: "object",
    properties: { password: { type: "string", minLength: 8 } },
    required: ["password"],
  },
} as const;

export const eliminarUsuarioSchema = {
  tags: ["Usuarios"],
  summary: "Elimina un usuario de tu organización (solo admin)",
  description: "No permite eliminar al único administrador de la organización.",
  security: bearer,
  params: usuarioIdParams,
} as const;

// --- Estadísticas ---

// Sin `format: date-time` a propósito: así se admite también la fecha corta
// (2026-07-01). El parseo y el orden desde/hasta los valida zod en la ruta.
const rangoFechas = {
  type: "object",
  properties: {
    desde: {
      type: "string",
      description: "Límite inferior, inclusive. ISO 8601 (2026-07-01 o 2026-07-01T10:00:00Z)",
    },
    hasta: {
      type: "string",
      description: "Límite superior, inclusive. ISO 8601 (2026-07-31 o 2026-07-31T23:59:59Z)",
    },
  },
} as const;

export const estadisticasResumenSchema = {
  tags: ["Estadísticas"],
  summary: "Resumen de tu organización: usuarios, emisores y comprobantes",
  security: bearer,
  querystring: rangoFechas,
} as const;

export const estadisticasEmisoresSchema = {
  tags: ["Estadísticas"],
  summary: "Desglose de comprobantes por cada emisor de tu organización",
  security: bearer,
  querystring: rangoFechas,
} as const;

export const estadisticasEmisorSchema = {
  tags: ["Estadísticas"],
  summary: "Estadísticas de un emisor concreto",
  security: bearer,
  params: {
    type: "object",
    properties: { cedula: { type: "string" } },
    required: ["cedula"],
  },
  querystring: rangoFechas,
} as const;

export const estadisticasSerieSchema = {
  tags: ["Estadísticas"],
  summary: "Comprobantes emitidos por día",
  security: bearer,
  querystring: rangoFechas,
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

export const apiKeyCrearSchema = {
  tags: ["Integraciones"],
  summary: "Crea una API key para una aplicación externa (solo admin)",
  description:
    "Devuelve el secreto en claro UNA sola vez. Guárdalo: después solo queda su hash. La app externa lo envía como `Authorization: Bearer factu_...`.",
  security: bearer,
  body: {
    type: "object",
    properties: {
      label: { type: "string", description: "Nombre de la integración (ej. \"ERP de ventas\")" },
      rol: { type: "string", enum: ["facturador", "lector"], description: "Alcance de la credencial" },
      emisores: {
        type: "array",
        items: { type: "string" },
        description: "Cédulas de emisor permitidas; vacío = todos los del tenant",
      },
      expiresAt: { type: "string", format: "date-time", description: "Vencimiento opcional" },
    },
    required: ["label"],
  },
} as const;

export const apiKeyListarSchema = {
  tags: ["Integraciones"],
  summary: "Lista las API keys de tu organización (solo admin)",
  security: bearer,
} as const;

export const apiKeyRevocarSchema = {
  tags: ["Integraciones"],
  summary: "Revoca una API key (solo admin)",
  security: bearer,
  params: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
} as const;
