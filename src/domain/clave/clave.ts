/**
 * Generación de la CLAVE NUMÉRICA de 50 dígitos y el CONSECUTIVO de 20 dígitos
 * según el formato del Ministerio de Hacienda de Costa Rica (facturación electrónica v4.4).
 *
 * Estructura de la clave (50 dígitos):
 *   país (3) + fecha ddmmaa (6) + cédula emisor (12) + consecutivo (20) + situación (1) + código de seguridad (8)
 *
 * Estructura del consecutivo (20 dígitos):
 *   sucursal (3) + terminal (5) + tipo de comprobante (2) + número consecutivo (10)
 */

/** Código de país fijo para Costa Rica. */
export const CODIGO_PAIS_CR = "506";

/** Tipo de comprobante — los 2 dígitos que van dentro del consecutivo. */
export enum TipoComprobante {
  FacturaElectronica = "01",
  NotaDebito = "02",
  NotaCredito = "03",
  TiqueteElectronico = "04",
  MensajeReceptor = "05",
  FacturaCompra = "08",
  FacturaExportacion = "09",
}

/**
 * Código de 2 dígitos que le corresponde a cada tipo de documento dentro del
 * consecutivo. Se indexa por el código corto que usa el resto del sistema
 * (FE/TE/NC/ND) para no acoplar este módulo al generador de XML.
 */
export const TIPO_POR_DOCUMENTO: Record<string, TipoComprobante> = {
  FE: TipoComprobante.FacturaElectronica,
  ND: TipoComprobante.NotaDebito,
  NC: TipoComprobante.NotaCredito,
  TE: TipoComprobante.TiqueteElectronico,
};

/**
 * Los 10 primeros dígitos del consecutivo (sucursal + terminal + tipo), que
 * identifican la serie a la que pertenece un número.
 */
export function prefijoConsecutivo(serie: {
  sucursal: number;
  terminal: number;
  tipo: string;
}): string {
  const tipo = TIPO_POR_DOCUMENTO[serie.tipo] ?? serie.tipo;
  return `${pad(serie.sucursal, 3)}${pad(serie.terminal, 5)}${tipo}`;
}

/** Situación del comprobante (1 dígito de la clave). */
export enum SituacionComprobante {
  Normal = "1",
  Contingencia = "2",
  SinInternet = "3",
}

export interface ConsecutivoInput {
  /** Sucursal (se rellena a 3 dígitos). Ej: 1 -> "001" */
  sucursal: number;
  /** Terminal/caja (se rellena a 5 dígitos). Ej: 1 -> "00001" */
  terminal: number;
  tipo: TipoComprobante;
  /** Número consecutivo del documento (se rellena a 10 dígitos). */
  consecutivo: number;
}

export interface ClaveInput extends ConsecutivoInput {
  /** Cédula del emisor (solo dígitos; se rellena a 12). */
  cedulaEmisor: string;
  /** Fecha de emisión. Por defecto, la fecha actual. */
  fecha?: Date;
  situacion?: SituacionComprobante;
  /**
   * Código de seguridad de 8 dígitos. Si se omite, se genera aleatorio.
   * Debe pasarse explícitamente en tests para tener resultados deterministas.
   */
  codigoSeguridad?: string;
}

export interface ClaveResult {
  clave: string;
  consecutivo: string;
  codigoSeguridad: string;
}

/** Rellena con ceros a la izquierda hasta `len`. Lanza si el valor no cabe. */
function pad(value: string | number, len: number): string {
  const s = String(value).replace(/\D/g, "");
  if (s.length > len) {
    throw new RangeError(`El valor "${value}" excede ${len} dígitos`);
  }
  return s.padStart(len, "0");
}

/** Construye el consecutivo de 20 dígitos. */
export function generarConsecutivo(input: ConsecutivoInput): string {
  const sucursal = pad(input.sucursal, 3);
  const terminal = pad(input.terminal, 5);
  const tipo = input.tipo; // ya son 2 dígitos
  const numero = pad(input.consecutivo, 10);
  return `${sucursal}${terminal}${tipo}${numero}`;
}

/** Genera un código de seguridad aleatorio de 8 dígitos. */
export function generarCodigoSeguridad(): string {
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += Math.floor(Math.random() * 10).toString();
  }
  return s;
}

/**
 * Formatea una fecha como ddmmaa (día, mes, año de 2 dígitos) en hora de Costa
 * Rica (UTC-6 fijo, el país no aplica horario de verano).
 *
 * Se calcula igual que el `FechaEmision` del XML: con la hora local del proceso
 * (UTC en el contenedor) toda emisión posterior a las 18:00 CR llevaría en la
 * clave el día siguiente al del comprobante, y Hacienda las vería incoherentes.
 */
function fechaDDMMAA(fecha: Date): string {
  const cr = new Date(fecha.getTime() - 6 * 60 * 60 * 1000);
  const dd = pad(cr.getUTCDate(), 2);
  const mm = pad(cr.getUTCMonth() + 1, 2);
  const aa = pad(cr.getUTCFullYear() % 100, 2);
  return `${dd}${mm}${aa}`;
}

/** Genera la clave numérica de 50 dígitos y su consecutivo. */
export function generarClave(input: ClaveInput): ClaveResult {
  const pais = CODIGO_PAIS_CR;
  const fecha = fechaDDMMAA(input.fecha ?? new Date());
  const cedula = pad(input.cedulaEmisor, 12);
  const consecutivo = generarConsecutivo(input);
  const situacion = input.situacion ?? SituacionComprobante.Normal;
  const codigoSeguridad = input.codigoSeguridad ?? generarCodigoSeguridad();

  if (codigoSeguridad.length !== 8 || /\D/.test(codigoSeguridad)) {
    throw new RangeError("El código de seguridad debe tener exactamente 8 dígitos");
  }

  const clave = `${pais}${fecha}${cedula}${consecutivo}${situacion}${codigoSeguridad}`;

  if (clave.length !== 50) {
    throw new Error(`Clave inválida: se esperaban 50 dígitos y se obtuvieron ${clave.length}`);
  }

  return { clave, consecutivo, codigoSeguridad };
}
