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
  // `consecutivo` es opcional desde D9 (2026-07-30): si se omite,
  // `/comprobante/:tipo/enviar` lo asigna atómicamente server-side. Se había
  // dejado como requerido aquí por error — este schema de Fastify es
  // independiente del Zod de `datosFacturaSchema` (routes/factura.ts) y se
  // valida ANTES que él, así que bloqueaba silenciosamente el camino sin
  // consecutivo — hallazgo real durante la integración con un cliente externo
  // (RestroCloud), que sí llama a esta ruta sin mandarlo.
  required: ["cedulaEmisor", "codigoActividadEmisor", "emisor", "lineas"],
} as const;

// ---- Esquemas por ruta ----

export const healthSchema = {
  tags: ["Utilidades"],
  summary: "Estado del servicio",
} as const;

export const ambienteSchema = {
  tags: ["Utilidades"],
  summary: "Ambiente de Hacienda activo (stag/prod) y estado de la firma",
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

// --- OAuth y reseteo de contraseña ---

export const oauthProveedoresSchema = {
  tags: ["Autenticación"],
  summary: "Proveedores OAuth configurados (Google / Microsoft)",
} as const;

export const oauthUrlSchema = {
  tags: ["Autenticación"],
  summary: "URL de consentimiento OAuth para iniciar sesión / registrarse",
  params: { type: "object", properties: { provider: { type: "string" } }, required: ["provider"] },
} as const;

export const oauthVincularUrlSchema = {
  tags: ["Autenticación"],
  summary: "URL de consentimiento OAuth para vincular la cuenta (autenticado)",
  security: bearer,
  params: { type: "object", properties: { provider: { type: "string" } }, required: ["provider"] },
} as const;

export const oauthCallbackSchema = {
  tags: ["Autenticación"],
  summary: "Callback de OAuth: canjea el code y redirige al frontend",
  params: { type: "object", properties: { provider: { type: "string" } }, required: ["provider"] },
} as const;

export const identidadesListarSchema = {
  tags: ["Autenticación"],
  summary: "Cuentas OAuth vinculadas del usuario actual",
  security: bearer,
} as const;

export const identidadDesvincularSchema = {
  tags: ["Autenticación"],
  summary: "Desvincula una cuenta OAuth del usuario actual",
  security: bearer,
  params: { type: "object", properties: { provider: { type: "string" } }, required: ["provider"] },
} as const;

export const passwordOlvideSchema = {
  tags: ["Autenticación"],
  summary: "Solicita un código para restablecer la contraseña",
  body: {
    type: "object",
    properties: { email: { type: "string" } },
    required: ["email"],
  },
} as const;

export const passwordResetSchema = {
  tags: ["Autenticación"],
  summary: "Restablece la contraseña con el código recibido",
  body: {
    type: "object",
    properties: {
      email: { type: "string" },
      codigo: { type: "string" },
      password: { type: "string" },
    },
    required: ["email", "codigo", "password"],
  },
} as const;

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

export const perfilActualizarSchema = {
  tags: ["Autenticación"],
  summary: "Actualiza tu propio perfil (nombre)",
  security: bearer,
  body: {
    type: "object",
    properties: { nombre: { type: "string" } },
    required: ["nombre"],
  },
} as const;

export const perfilPasswordSchema = {
  tags: ["Autenticación"],
  summary: "Cambia tu propia contraseña (verifica la actual)",
  security: bearer,
  body: {
    type: "object",
    properties: {
      actual: { type: "string" },
      nueva: { type: "string", minLength: 8 },
    },
    required: ["actual", "nueva"],
  },
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
    properties: {
      cedula: { type: "string" },
      nombre: { type: "string" },
      datosFiscales: {
        type: "object",
        description: "Datos fiscales para emitir sin reingresarlos",
        properties: {
          tipoIdentificacion: { type: "string" },
          nombreComercial: { type: "string" },
          correoElectronico: { type: "string" },
          telefono: {
            type: "object",
            properties: { codigoPais: { type: "string" }, numTelefono: { type: "string" } },
          },
          ubicacion: {
            type: "object",
            properties: {
              provincia: { type: "string" },
              canton: { type: "string" },
              distrito: { type: "string" },
              otrasSenas: { type: "string" },
            },
          },
          codigoActividad: { type: "string" },
        },
      },
    },
    required: ["cedula", "nombre"],
  },
} as const;

export const clientesListarSchema = {
  tags: ["Emisores"],
  summary: "Lista los clientes (receptores) usados en facturas pasadas",
  security: bearer,
} as const;

export const clienteBuscarSchema = {
  tags: ["Emisores"],
  summary: "Busca un cliente por su número de identificación (autocompletar)",
  security: bearer,
  params: { type: "object", properties: { numero: { type: "string" } }, required: ["numero"] },
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

export const comprobantesListarSchema = {
  tags: ["Comprobantes"],
  summary: "Lista los comprobantes emitidos del tenant (facturas enviadas)",
  security: bearer,
} as const;

export const comprobanteReenviarSchema = {
  tags: ["Comprobantes"],
  summary: "Reenvía el comprobante al cliente por correo (PDF + XML)",
  security: bearer,
  params: { type: "object", properties: { clave: { type: "string" } }, required: ["clave"] },
  body: {
    type: "object",
    properties: { correo: { type: "string", format: "email", description: "Destino; si se omite, el último usado" } },
  },
} as const;

export const comprobanteEnviosSchema = {
  tags: ["Comprobantes"],
  summary: "Historial de envíos del comprobante al cliente",
  security: bearer,
  params: { type: "object", properties: { clave: { type: "string" } }, required: ["clave"] },
} as const;

export const comprobanteGetSchema = {
  tags: ["Comprobantes"],
  summary: "Consulta un comprobante persistido por su clave (incluye el XML firmado)",
  security: bearer,
  params: {
    type: "object",
    properties: { clave: { type: "string" } },
    required: ["clave"],
  },
} as const;

export const comprobantePdfSchema = {
  tags: ["Comprobantes"],
  summary: "Genera el PDF del comprobante a partir de su XML firmado (base64)",
  security: bearer,
  params: {
    type: "object",
    properties: { clave: { type: "string" } },
    required: ["clave"],
  },
} as const;

const borradorBody = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["factura", "tiquete", "nota-credito", "nota-debito"] },
    cedulaEmisor: { type: "string" },
    receptorNombre: { type: "string" },
    total: { type: "number" },
    datos: { type: "object", additionalProperties: true, description: "Estado del formulario de emisión" },
  },
  required: ["tipo", "datos"],
} as const;

export const borradorCrearSchema = {
  tags: ["Borradores"],
  summary: "Guarda una factura en borrador",
  security: bearer,
  body: borradorBody,
} as const;

export const borradorActualizarSchema = {
  tags: ["Borradores"],
  summary: "Actualiza un borrador",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  body: borradorBody,
} as const;

export const borradorListarSchema = {
  tags: ["Borradores"],
  summary: "Lista los borradores del tenant",
  security: bearer,
} as const;

export const borradorGetSchema = {
  tags: ["Borradores"],
  summary: "Detalle de un borrador (con los datos del formulario)",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
} as const;

export const borradorEliminarSchema = {
  tags: ["Borradores"],
  summary: "Elimina un borrador",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
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

const buzonBody = {
  type: "object",
  properties: {
    host: { type: "string", description: "Servidor IMAP, ej. imap.gmail.com" },
    port: { type: "number", description: "Puerto IMAP, ej. 993" },
    secure: { type: "boolean", description: "TLS directo (993)" },
    usuario: { type: "string", description: "Usuario/correo" },
    password: { type: "string", description: "Contraseña (o app password)" },
    carpeta: { type: "string", description: "Carpeta a revisar (INBOX)" },
    activo: { type: "boolean" },
  },
  required: ["host", "port", "usuario", "password"],
} as const;

export const correoGetSchema = {
  tags: ["Correo"],
  summary: "Configuración del buzón de correo (sin contraseña)",
  security: bearer,
} as const;

const smtpBody = {
  type: "object",
  properties: {
    host: { type: "string", description: "Servidor SMTP, ej. smtp.gmail.com" },
    port: { type: "number", description: "Puerto, ej. 587 (STARTTLS) o 465 (TLS)" },
    secure: { type: "boolean", description: "TLS directo (465)" },
    usuario: { type: "string" },
    password: { type: "string", description: "Contraseña o app password" },
    remitente: { type: "string", description: 'Remitente, ej. "Mi Empresa <facturas@empresa.cr>"' },
    activo: { type: "boolean" },
  },
  required: ["host", "remitente"],
} as const;

export const correoSalidaGetSchema = {
  tags: ["Correo"],
  summary: "Configuración del correo de salida (SMTP), sin contraseña",
  security: bearer,
} as const;

export const correoSalidaGuardarSchema = {
  tags: ["Correo"],
  summary: "Guarda la configuración del correo de salida (contraseña cifrada)",
  security: bearer,
  body: smtpBody,
} as const;

export const correoSalidaEliminarSchema = {
  tags: ["Correo"],
  summary: "Elimina la configuración del correo de salida",
  security: bearer,
} as const;

export const correoSalidaProbarSchema = {
  tags: ["Correo"],
  summary: "Prueba la conexión SMTP de salida",
  security: bearer,
  body: smtpBody,
} as const;

export const correoGuardarSchema = {
  tags: ["Correo"],
  summary: "Guarda la configuración del buzón (contraseña cifrada en reposo)",
  security: bearer,
  body: buzonBody,
} as const;

export const correoEliminarSchema = {
  tags: ["Correo"],
  summary: "Elimina la configuración del buzón",
  security: bearer,
} as const;

export const correoProbarSchema = {
  tags: ["Correo"],
  summary: "Prueba la conexión IMAP",
  security: bearer,
  body: buzonBody,
} as const;

export const correoSincronizarSchema = {
  tags: ["Correo"],
  summary: "Revisa el buzón ahora y registra los XML recibidos",
  security: bearer,
} as const;

export const recibidoCrearSchema = {
  tags: ["Recibidos"],
  summary: "Registra un comprobante recibido a partir de su XML",
  description: "Deduplica por clave dentro del tenant. Úsalo para las facturas que te emiten.",
  security: bearer,
  body: {
    type: "object",
    properties: { xml: { type: "string", description: "XML del comprobante recibido (v4.4)" } },
    required: ["xml"],
  },
} as const;

export const recibidoListarSchema = {
  tags: ["Recibidos"],
  summary: "Lista los documentos recibidos del tenant (sin XML)",
  security: bearer,
} as const;

export const recibidoGetSchema = {
  tags: ["Recibidos"],
  summary: "Detalle de un documento recibido (con XML y mensaje receptor)",
  security: bearer,
  params: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
} as const;

export const recibidoEliminarSchema = {
  tags: ["Recibidos"],
  summary: "Elimina un documento recibido",
  security: bearer,
  params: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
} as const;

export const recibidoMensajeReceptorSchema = {
  tags: ["Recibidos"],
  summary: "Genera y guarda el mensaje receptor de un documento recibido",
  security: bearer,
  params: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  body: {
    type: "object",
    properties: {
      respuesta: { type: "string", enum: ["1", "2", "3"], description: "1 aceptado, 2 parcial, 3 rechazado" },
      detalleMensaje: { type: "string" },
    },
    required: ["respuesta"],
  },
} as const;

export const chatContactosSchema = {
  tags: ["Chat"],
  summary: "Usuarios del tenant con no leídos y último mensaje",
  security: bearer,
} as const;

export const chatNoLeidosSchema = {
  tags: ["Chat"],
  summary: "Total de mensajes sin leer",
  security: bearer,
} as const;

export const chatConversacionSchema = {
  tags: ["Chat"],
  summary: "Conversación con un usuario (marca los recibidos como leídos)",
  security: bearer,
  params: { type: "object", properties: { usuarioId: { type: "string" } }, required: ["usuarioId"] },
} as const;

export const chatEnviarSchema = {
  tags: ["Chat"],
  summary: "Envía un mensaje a un usuario del tenant",
  security: bearer,
  body: {
    type: "object",
    properties: {
      para: { type: "string", description: "Id del usuario destino" },
      texto: { type: "string", maxLength: 4000 },
    },
    required: ["para", "texto"],
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

const webhookBody = {
  type: "object",
  properties: {
    url: { type: "string", format: "uri", description: "URL destino (HTTPS) que recibirá el POST" },
    secret: {
      type: "string",
      description: "Secreto para firmar (HMAC-SHA256). Se guarda cifrado; envía \"\" para conservarlo al editar",
    },
    eventos: {
      type: "array",
      items: {
        type: "string",
        enum: ["comprobante.aceptado", "comprobante.rechazado", "documento.recibido", "entrega.cliente"],
      },
      description: "Eventos a los que se suscribe",
    },
    activo: { type: "boolean", description: "Si está activo recibe notificaciones" },
  },
  required: ["url", "eventos"],
} as const;

export const webhookListarSchema = {
  tags: ["Integraciones"],
  summary: "Lista los webhooks salientes de tu organización (solo admin)",
  security: bearer,
} as const;

export const webhookCrearSchema = {
  tags: ["Integraciones"],
  summary: "Crea un webhook saliente (solo admin)",
  security: bearer,
  body: webhookBody,
} as const;

export const webhookActualizarSchema = {
  tags: ["Integraciones"],
  summary: "Actualiza un webhook saliente (solo admin)",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  body: webhookBody,
} as const;

export const webhookEliminarSchema = {
  tags: ["Integraciones"],
  summary: "Elimina un webhook saliente (solo admin)",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
} as const;

export const webhookProbarSchema = {
  tags: ["Integraciones"],
  summary: "Envía un evento de prueba al webhook (solo admin)",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
} as const;

export const webhookEntregasSchema = {
  tags: ["Integraciones"],
  summary: "Historial de entregas de un webhook (solo admin)",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
} as const;

export const auditoriaListarSchema = {
  tags: ["Auditoría"],
  summary: "Registro de auditoría de la organización (solo admin)",
  description: "Acciones de negocio (login, emisión, integraciones, configuración) atribuidas a un usuario o API key.",
  security: bearer,
  querystring: {
    type: "object",
    properties: {
      accion: { type: "string", description: "Filtra por acción exacta, ej. \"comprobante.emitir\"" },
      limite: { type: "integer", minimum: 1, maximum: 500, description: "Máximo de registros (por defecto 200)" },
    },
  },
} as const;

export const logsListarSchema = {
  tags: ["Auditoría"],
  summary: "Registro del sistema (logs técnicos) de la organización (solo admin)",
  description: "Eventos técnicos: pollers, entregas, webhooks y errores.",
  security: bearer,
  querystring: {
    type: "object",
    properties: {
      nivel: { type: "string", enum: ["info", "warn", "error"], description: "Filtra por nivel" },
      origen: { type: "string", description: "Filtra por origen, ej. \"webhooks\"" },
      limite: { type: "integer", minimum: 1, maximum: 500, description: "Máximo de registros (por defecto 200)" },
    },
  },
} as const;

const canalBody = {
  type: "object",
  properties: {
    tipo: {
      type: "string",
      enum: ["sms", "whatsapp", "slack", "teams", "bitrix24"],
      description: "Tipo de canal",
    },
    proveedor: {
      type: "string",
      enum: ["twilio", "whatsapp_cloud", "slack", "teams", "bitrix24"],
      description: "Proveedor concreto",
    },
    nombre: { type: "string", description: "Nombre del canal, ej. \"Alertas del equipo\"" },
    config: {
      type: "object",
      additionalProperties: true,
      description: "Credenciales + destino del proveedor. Al editar, omitir para conservar",
    },
    eventos: {
      type: "array",
      items: {
        type: "string",
        enum: ["comprobante.aceptado", "comprobante.rechazado", "documento.recibido", "entrega.cliente"],
      },
      description: "Eventos a los que reacciona el canal",
    },
    activo: { type: "boolean" },
  },
  required: ["tipo", "proveedor", "nombre", "eventos"],
} as const;

export const canalNotifListarSchema = {
  tags: ["Notificaciones"],
  summary: "Lista los canales de notificación de tu organización (solo admin)",
  security: bearer,
} as const;

export const canalNotifCrearSchema = {
  tags: ["Notificaciones"],
  summary: "Crea un canal de notificación (solo admin)",
  security: bearer,
  body: canalBody,
} as const;

export const canalNotifActualizarSchema = {
  tags: ["Notificaciones"],
  summary: "Actualiza un canal de notificación (solo admin)",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  body: canalBody,
} as const;

export const canalNotifEliminarSchema = {
  tags: ["Notificaciones"],
  summary: "Elimina un canal de notificación (solo admin)",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
} as const;

export const canalNotifProbarSchema = {
  tags: ["Notificaciones"],
  summary: "Envía una notificación de prueba por el canal (solo admin)",
  security: bearer,
  params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
} as const;

export const notifProveedoresSchema = {
  tags: ["Notificaciones"],
  summary: "Catálogo de proveedores disponibles y sus campos de configuración",
  security: bearer,
} as const;

export const notifEventosSchema = {
  tags: ["Notificaciones"],
  summary: "Catálogo de eventos que pueden disparar notificaciones",
  security: bearer,
} as const;

export const notifHistorialSchema = {
  tags: ["Notificaciones"],
  summary: "Historial de notificaciones enviadas (solo admin)",
  security: bearer,
  querystring: {
    type: "object",
    properties: {
      estado: { type: "string", enum: ["pendiente", "enviado", "fallido", "reintentando"] },
      canalId: { type: "string" },
      limite: { type: "integer", minimum: 1, maximum: 500 },
    },
  },
} as const;
