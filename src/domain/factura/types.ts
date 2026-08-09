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

/** Condición de venta (catálogo completo del XSD v4.4). */
export enum CondicionVenta {
  Contado = "01",
  Credito = "02",
  Consignacion = "03",
  Apartado = "04",
  ArrendamientoOpcionCompra = "05",
  ArrendamientoFuncionFinanciera = "06",
  CobroFavorTercero = "07",
  ServiciosEstadoCredito = "08",
  /** Venta a crédito en IVA hasta 90 días (artículo 27, LIVA). */
  CreditoIva90Dias = "10",
  MercanciaNoNacionalizada = "12",
  BienesUsadosNoContribuyente = "13",
  ArrendamientoOperativo = "14",
  ArrendamientoFinanciero = "15",
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

/** Código de impuesto (catálogo completo del XSD v4.4). */
export enum CodigoImpuesto {
  IVA = "01",
  SelectivoConsumo = "02",
  Combustibles = "03",
  BebidasAlcoholicas = "04",
  BebidasEnvasadasYJabones = "05",
  Tabaco = "06",
  /** IVA cálculo especial. */
  IvaCalculoEspecial = "07",
  /** IVA régimen de bienes usados (factor). */
  IvaBienesUsados = "08",
  Cemento = "12",
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

/** Código de descuento (catálogo v4.4, nota 20). Obligatorio si hay descuento. */
export enum CodigoDescuento {
  Regalia = "01",
  RegaliaIvaCobradoAlCliente = "02",
  Bonificacion = "03",
  Volumen = "04",
  Temporada = "05",
  Promocional = "06",
  Comercial = "07",
  Frecuencia = "08",
  Sostenido = "09",
  Otros = "99",
}

export interface Descuento {
  monto: number;
  /**
   * Código del catálogo. Si se omite se asume "07" (descuento comercial), el
   * genérico: v4.4 lo exige y antes no se enviaba, así que las peticiones
   * viejas siguen funcionando.
   */
  codigo?: CodigoDescuento | string;
  /**
   * Descripción libre, obligatoria para Hacienda cuando el código es "99".
   * Si se omite se usa la naturaleza.
   */
  codigoOtro?: string;
  /** Naturaleza/justificación del descuento. */
  naturaleza: string;
}

/** Tipo de documento que respalda la exoneración (catálogo v4.4, nota 12). */
export enum TipoExoneracion {
  ComprasAutorizadasDGT = "01",
  VentasExentasDiplomaticos = "02",
  AutorizadoPorLeyEspecial = "03",
  ExencionesDGHAutorizacionLocal = "04",
  ExencionesDGHTransitorioV = "05",
  ServiciosTuristicosICT = "06",
  TransitorioXVII = "07",
  ZonaFranca = "08",
  ServiciosComplementariosExportacion = "09",
  CorporacionesMunicipales = "10",
  ExencionesDGHAutorizacionImpuesto = "11",
  Otros = "99",
}

/**
 * Exoneración aplicada a un impuesto de la línea.
 *
 * La usa quien le factura a una zona franca, a una institución exonerada o a un
 * diplomático: el impuesto se calcula y luego se rebaja en el porcentaje
 * exonerado, y hay que decir con qué documento se respalda.
 */
export interface Exoneracion {
  tipoDocumento: TipoExoneracion | string;
  /** Descripción libre; obligatoria si el tipo es "99". */
  tipoDocumentoOtro?: string;
  /** Número del documento de exoneración (3 a 40 caracteres). */
  numeroDocumento: string;
  articulo?: number;
  inciso?: number;
  /** Código de institución (01–12, 99) del catálogo de Hacienda. */
  nombreInstitucion: string;
  /** Obligatorio si la institución es "99". */
  nombreInstitucionOtros?: string;
  fechaEmision: Date;
  /** Porcentaje exonerado del impuesto, ej. 13 para exonerar el IVA completo. */
  tarifaExonerada: number;
}

export interface Impuesto {
  codigo: CodigoImpuesto;
  codigoTarifa: CodigoTarifa;
  /** Porcentaje, ej. 13 para 13%. */
  tarifa: number;
  /** Si viene, el impuesto se rebaja en el porcentaje exonerado. */
  exoneracion?: Exoneracion;
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
  /** Solo en facturas de exportación: partida arancelaria de la mercancía. */
  partidaArancelaria?: string;
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

/**
 * Tipo del documento referenciado (catálogo completo del XSD v4.4).
 *
 * OJO: el "02" es la NOTA DE DÉBITO electrónica. La nota de despacho es el "05".
 * Estaban intercambiados y se emitían referencias con otro significado.
 */
export enum TipoDocReferencia {
  FacturaElectronica = "01",
  NotaDebitoElectronica = "02",
  NotaCreditoElectronica = "03",
  TiqueteElectronico = "04",
  NotaDespacho = "05",
  Contrato = "06",
  Procedimiento = "07",
  ComprobanteContingencia = "08",
  DevolucionMercaderia = "09",
  ComprobanteRechazadoPorHacienda = "10",
  SustituyeFacturaRechazadaPorReceptor = "11",
  SustituyeFacturaExportacion = "12",
  FacturacionMesVencido = "13",
  ComprobanteRegimenEspecial = "14",
  SustituyeFacturaCompra = "15",
  ProveedorNoDomiciliado = "16",
  NotaCreditoAFacturaCompra = "17",
  NotaDebitoAFacturaCompra = "18",
  Otro = "99",
}

/** Razón/código de la referencia (catálogo completo del XSD v4.4). */
export enum CodigoReferencia {
  /** Anula el documento de referencia. */
  AnulaDocumento = "01",
  /** Corrige el TEXTO del documento de referencia (no el monto). */
  CorrigeTexto = "02",
  /** Referencia a otro documento. */
  ReferenciaOtroDocumento = "04",
  /** Sustituye comprobante provisional por contingencia. */
  SustituyeComprobanteContingencia = "05",
  DevolucionMercancia = "06",
  SustituyeComprobanteElectronico = "07",
  FacturaEndosada = "08",
  NotaCreditoFinanciera = "09",
  NotaDebitoFinanciera = "10",
  ProveedorNoDomiciliado = "11",
  CreditoPorExoneracionPosterior = "12",
  Otros = "99",
}

/**
 * Información de referencia a un documento previo. Obligatoria en notas de
 * crédito y débito (identifica qué documento se corrige/anula y por qué).
 */
export interface InformacionReferencia {
  tipoDoc: TipoDocReferencia | string;
  /** Descripción del tipo de documento; obligatoria si tipoDoc es "99". */
  tipoDocOtro?: string;
  /** Clave de 50 dígitos del documento referenciado. */
  numero: string;
  fechaEmision: Date;
  codigo: CodigoReferencia | string;
  /** Descripción de la razón; obligatoria si codigo es "99". */
  codigoOtro?: string;
  razon: string;
}

export interface FacturaInput {
  /** Clave numérica de 50 dígitos (generada en el hito 1). */
  clave: string;
  /**
   * Cédula del proveedor del sistema de facturación (nodo ProveedorSistemas,
   * obligatorio en v4.4). Si se omite, el generador usa la cédula del emisor.
   */
  proveedorSistemas?: string;
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
