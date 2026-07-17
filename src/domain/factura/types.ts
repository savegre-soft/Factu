/**
 * Modelo de dominio para la Factura Electrónica de Costa Rica (v4.4).
 *
 * Estos tipos representan la ENTRADA de negocio (lo que el usuario de la API envía).
 * A partir de ellos se calculan los totales y se construye el XML.
 */

/** Tipo de identificación (Emisor/Receptor). */
export enum TipoIdentificacion {
  Fisica = "01",
  Juridica = "02",
  Dimex = "03",
  Nite = "04",
}

/** Condición de venta (catálogo de Hacienda; los más comunes). */
export enum CondicionVenta {
  Contado = "01",
  Credito = "02",
  Consignacion = "03",
  Apartado = "04",
  ArrendamientoOpcionCompra = "05",
  ArrendamientoFuncionFinanciera = "06",
  Otros = "99",
}

/** Tipo de medio de pago. */
export enum TipoMedioPago {
  Efectivo = "01",
  Tarjeta = "02",
  Cheque = "03",
  Transferencia = "04",
  Otros = "99",
}

/** Código de impuesto (subconjunto habitual). */
export enum CodigoImpuesto {
  IVA = "01",
  SelectivoConsumo = "02",
  Otros = "99",
}

/**
 * Código de tarifa del IVA (catálogo v4.4).
 * Ej.: "08" = tarifa general 13%, "01" = 0% (exento/no sujeto según caso).
 */
export type CodigoTarifa = string;

export interface Identificacion {
  tipo: TipoIdentificacion;
  /** Solo dígitos. */
  numero: string;
}

export interface Ubicacion {
  /** Código de provincia (1 dígito). */
  provincia: string;
  /** Código de cantón (2 dígitos). */
  canton: string;
  /** Código de distrito (2 dígitos). */
  distrito: string;
  barrio?: string;
  otrasSenas: string;
}

export interface Telefono {
  /** Código de país (ej. "506"). */
  codigoPais: string;
  numTelefono: string;
}

export interface Emisor {
  nombre: string;
  identificacion: Identificacion;
  nombreComercial?: string;
  ubicacion: Ubicacion;
  telefono?: Telefono;
  correoElectronico: string;
}

/** El receptor es opcional (p. ej. tiquete a consumidor final). */
export interface Receptor {
  nombre: string;
  identificacion: Identificacion;
  nombreComercial?: string;
  ubicacion?: Ubicacion;
  telefono?: Telefono;
  correoElectronico?: string;
}

export interface Descuento {
  monto: number;
  /** Naturaleza/justificación del descuento. */
  naturaleza: string;
}

export interface Impuesto {
  codigo: CodigoImpuesto;
  codigoTarifa: CodigoTarifa;
  /** Porcentaje, ej. 13 para 13%. */
  tarifa: number;
}

export interface LineaDetalle {
  /** Código CABYS de 13 dígitos (obligatorio en v4.4). */
  codigoCabys: string;
  cantidad: number;
  /** Unidad de medida del catálogo (ej. "Unid", "Sp" para servicios). */
  unidadMedida: string;
  detalle: string;
  precioUnitario: number;
  /** true si la línea es un servicio; false/omitido = mercancía. */
  esServicio?: boolean;
  descuentos?: Descuento[];
  /** Impuestos aplicables. Sin impuestos => línea exenta. */
  impuestos?: Impuesto[];
}

export interface MedioPago {
  tipo: TipoMedioPago;
  /** Monto pagado por este medio. Si se omite, se asume el total del comprobante. */
  monto?: number;
}

export interface Moneda {
  /** Código ISO 4217, ej. "CRC", "USD". */
  codigo: string;
  /** Tipo de cambio respecto al colón. Obligatorio si la moneda no es CRC. */
  tipoCambio?: number;
}

/** Tipo del documento referenciado (para notas de crédito/débito). */
export enum TipoDocReferencia {
  FacturaElectronica = "01",
  NotaDespachoElectronica = "02",
  TiqueteElectronico = "04",
  NotaDespacho = "05",
  ComprobanteContingencia = "08",
  Otro = "99",
}

/** Razón/código de la referencia. */
export enum CodigoReferencia {
  /** Anula el documento de referencia. */
  AnulaDocumento = "01",
  /** Corrige el monto. */
  CorrigeMonto = "02",
  /** Referencia a otro documento. */
  ReferenciaOtroDocumento = "04",
  /** Sustituye comprobante provisional por contingencia. */
  SustituyeComprobanteContingencia = "05",
  Otros = "99",
}

/**
 * Información de referencia a un documento previo. Obligatoria en notas de
 * crédito y débito (identifica qué documento se corrige/anula y por qué).
 */
export interface InformacionReferencia {
  tipoDoc: TipoDocReferencia | string;
  /** Clave de 50 dígitos del documento referenciado. */
  numero: string;
  fechaEmision: Date;
  codigo: CodigoReferencia | string;
  razon: string;
}

export interface FacturaInput {
  /** Clave numérica de 50 dígitos (generada en el hito 1). */
  clave: string;
  /** Consecutivo de 20 dígitos (generado en el hito 1). */
  numeroConsecutivo: string;
  /** Código de actividad económica del emisor (6 dígitos). */
  codigoActividadEmisor: string;
  codigoActividadReceptor?: string;
  /** Fecha de emisión. Por defecto, ahora. */
  fechaEmision?: Date;
  emisor: Emisor;
  receptor?: Receptor;
  condicionVenta: CondicionVenta;
  /** Plazo de crédito (obligatorio si condicionVenta = Crédito). */
  plazoCredito?: string;
  moneda?: Moneda;
  lineas: LineaDetalle[];
  mediosPago?: MedioPago[];
  /** Referencias a documentos previos (obligatorio en notas de crédito/débito). */
  informacionReferencia?: InformacionReferencia[];
}
