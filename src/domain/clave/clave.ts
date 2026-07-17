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

/** Formatea una fecha como ddmmaa (día, mes, año de 2 dígitos). */
function fechaDDMMAA(fecha: Date): string {
  const dd = pad(fecha.getDate(), 2);
  const mm = pad(fecha.getMonth() + 1, 2);
  const aa = pad(fecha.getFullYear() % 100, 2);
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
