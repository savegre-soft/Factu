/**
 * Validación de dominio de un comprobante ANTES de generar el XML y enviarlo.
 *
 * Captura los errores más comunes que Hacienda rechazaría (campos obligatorios,
 * formatos, consistencia de impuestos, referencias en notas, etc.) para fallar
 * temprano con mensajes claros en vez de esperar el rechazo del Ministerio.
 *
 * Es lógica PURA: recibe los datos de negocio y devuelve una lista de errores.
 */
import {
  TipoIdentificacion,
  CondicionVenta,
  type Emisor,
  type Receptor,
  type LineaDetalle,
  type Moneda,
  type InformacionReferencia,
} from "../factura/types.js";
import { TipoDocumento } from "../factura/facturaXml.js";

export interface ErrorValidacion {
  campo: string;
  mensaje: string;
}

/**
 * Código de actividad económica: el XSD v4.4 lo define como una cadena de
 * exactamente 6 caracteres, no como 6 dígitos. Desde TRIBU-CR el catálogo es
 * CIIU4 y viene con punto (`8549.0`, tal cual lo devuelve `/fe/ae` del RUT);
 * se siguen aceptando los CIIU3 viejos de 6 dígitos (`620100`).
 */
const ACTIVIDAD_VALIDA = /^(\d{4}\.\d|\d{6})$/;
const MENSAJE_ACTIVIDAD = "Debe tener 6 caracteres: CIIU4 del RUT (p. ej. 8549.0) o 6 dígitos";

/** Subconjunto de negocio que se valida (lo satisfacen FacturaInput y DatosFactura). */
export interface ComprobanteValidable {
  codigoActividadEmisor: string;
  codigoActividadReceptor?: string;
  emisor: Emisor;
  receptor?: Receptor;
  condicionVenta: CondicionVenta;
  plazoCredito?: string;
  moneda?: Moneda;
  lineas: LineaDetalle[];
  informacionReferencia?: InformacionReferencia[];
}

/** Largo esperado del número de identificación según su tipo. */
const LARGO_IDENTIFICACION: Record<string, number[]> = {
  [TipoIdentificacion.Fisica]: [9],
  [TipoIdentificacion.Juridica]: [10],
  [TipoIdentificacion.Dimex]: [11, 12],
  [TipoIdentificacion.Nite]: [10],
};

const soloDigitos = (s: string) => /^\d+$/.test(s);

function validarIdentificacion(
  errores: ErrorValidacion[],
  prefijo: string,
  tipo: string,
  numero: string,
): void {
  if (!soloDigitos(numero)) {
    errores.push({ campo: `${prefijo}.numero`, mensaje: "Debe contener solo dígitos" });
    return;
  }
  const largos = LARGO_IDENTIFICACION[tipo];
  if (largos && !largos.includes(numero.length)) {
    errores.push({
      campo: `${prefijo}.numero`,
      mensaje: `Para el tipo ${tipo} se esperan ${largos.join(" o ")} dígitos, no ${numero.length}`,
    });
  }
}

function validarEmisor(errores: ErrorValidacion[], emisor: Emisor): void {
  if (!emisor.nombre?.trim()) errores.push({ campo: "emisor.nombre", mensaje: "Obligatorio" });
  validarIdentificacion(
    errores,
    "emisor.identificacion",
    emisor.identificacion.tipo,
    emisor.identificacion.numero,
  );
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emisor.correoElectronico)) {
    errores.push({ campo: "emisor.correoElectronico", mensaje: "Correo inválido" });
  }
  const u = emisor.ubicacion;
  if (!/^\d$/.test(u.provincia))
    errores.push({ campo: "emisor.ubicacion.provincia", mensaje: "Debe ser 1 dígito" });
  if (!/^\d{2}$/.test(u.canton))
    errores.push({ campo: "emisor.ubicacion.canton", mensaje: "Debe ser 2 dígitos" });
  if (!/^\d{2}$/.test(u.distrito))
    errores.push({ campo: "emisor.ubicacion.distrito", mensaje: "Debe ser 2 dígitos" });
}

function validarLinea(errores: ErrorValidacion[], linea: LineaDetalle, i: number): void {
  const p = `lineas[${i}]`;
  if (!/^\d{13}$/.test(linea.codigoCabys)) {
    errores.push({ campo: `${p}.codigoCabys`, mensaje: "El código CABYS debe tener 13 dígitos" });
  }
  if (!(linea.cantidad > 0)) {
    errores.push({ campo: `${p}.cantidad`, mensaje: "Debe ser mayor que 0" });
  }
  if (linea.precioUnitario < 0) {
    errores.push({ campo: `${p}.precioUnitario`, mensaje: "No puede ser negativo" });
  }
  if (!linea.detalle?.trim()) {
    errores.push({ campo: `${p}.detalle`, mensaje: "Obligatorio" });
  }

  const montoTotal = linea.cantidad * linea.precioUnitario;
  const totalDescuento = (linea.descuentos ?? []).reduce((a, d) => a + d.monto, 0);
  if (totalDescuento > montoTotal) {
    errores.push({
      campo: `${p}.descuentos`,
      mensaje: "La suma de descuentos supera el monto de la línea",
    });
  }
  for (const [j, imp] of (linea.impuestos ?? []).entries()) {
    if (imp.tarifa < 0 || imp.tarifa > 100) {
      errores.push({ campo: `${p}.impuestos[${j}].tarifa`, mensaje: "Debe estar entre 0 y 100" });
    }
    if (!imp.codigoTarifa?.trim()) {
      errores.push({ campo: `${p}.impuestos[${j}].codigoTarifa`, mensaje: "Obligatorio" });
    }
  }
}

function validarReferencias(
  errores: ErrorValidacion[],
  refs: InformacionReferencia[],
): void {
  for (const [i, ref] of refs.entries()) {
    const p = `informacionReferencia[${i}]`;
    if (!/^\d{50}$/.test(ref.numero)) {
      errores.push({ campo: `${p}.numero`, mensaje: "Debe ser la clave de 50 dígitos del documento referenciado" });
    }
    if (!ref.razon?.trim()) errores.push({ campo: `${p}.razon`, mensaje: "Obligatorio" });
    if (!ref.tipoDoc?.trim()) errores.push({ campo: `${p}.tipoDoc`, mensaje: "Obligatorio" });
    if (!ref.codigo?.trim()) errores.push({ campo: `${p}.codigo`, mensaje: "Obligatorio" });
  }
}

/**
 * Valida un comprobante y devuelve la lista de errores (vacía si es válido).
 * `tipo` ajusta las reglas: el tiquete no exige receptor; las notas exigen
 * información de referencia.
 */
export function validarComprobante(
  tipo: TipoDocumento,
  datos: ComprobanteValidable,
): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  if (!ACTIVIDAD_VALIDA.test(datos.codigoActividadEmisor)) {
    errores.push({ campo: "codigoActividadEmisor", mensaje: MENSAJE_ACTIVIDAD });
  }

  validarEmisor(errores, datos.emisor);

  // El receptor es obligatorio salvo en el tiquete electrónico.
  if (tipo !== TipoDocumento.TiqueteElectronico) {
    if (!datos.receptor) {
      errores.push({ campo: "receptor", mensaje: "Obligatorio para este tipo de comprobante" });
    } else {
      validarIdentificacion(
        errores,
        "receptor.identificacion",
        datos.receptor.identificacion.tipo,
        datos.receptor.identificacion.numero,
      );
    }
  }

  if (datos.condicionVenta === CondicionVenta.Credito && !datos.plazoCredito?.trim()) {
    errores.push({ campo: "plazoCredito", mensaje: "Obligatorio cuando la condición de venta es crédito" });
  }

  if (datos.moneda && datos.moneda.codigo !== "CRC") {
    if (!datos.moneda.tipoCambio || datos.moneda.tipoCambio <= 0) {
      errores.push({ campo: "moneda.tipoCambio", mensaje: "Obligatorio y > 0 cuando la moneda no es CRC" });
    }
  }

  if (!datos.lineas || datos.lineas.length === 0) {
    errores.push({ campo: "lineas", mensaje: "Debe haber al menos una línea de detalle" });
  } else {
    datos.lineas.forEach((linea, i) => validarLinea(errores, linea, i));
  }

  const refs = datos.informacionReferencia ?? [];
  const requiereRef =
    tipo === TipoDocumento.NotaCredito || tipo === TipoDocumento.NotaDebito;
  if (requiereRef && refs.length === 0) {
    errores.push({
      campo: "informacionReferencia",
      mensaje: "Las notas de crédito/débito requieren al menos una referencia",
    });
  }
  validarReferencias(errores, refs);

  return errores;
}
