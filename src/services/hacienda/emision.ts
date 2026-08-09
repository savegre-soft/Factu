/**
 * Orquestador de emisión: une todos los hitos en un solo flujo.
 *
 *   1. Genera la clave numérica (hito 1)
 *   2. Construye el XML de la factura (hito 3)
 *   3. Lo firma con XAdES (hito 4)
 *   4. Arma el sobre y lo envía a Hacienda (hito 5)
 *
 * Las dependencias externas (proveedor de token, firmador, cliente de recepción)
 * se inyectan para poder probar el flujo completo sin red ni certificados reales.
 */
import {
  generarClave,
  TipoComprobante,
  SituacionComprobante,
} from "../../domain/clave/clave.js";
import {
  generarComprobanteXml,
  fechaEmisionISO,
  TipoDocumento,
} from "../../domain/factura/facturaXml.js";
import type { FacturaInput } from "../../domain/factura/types.js";
import { calcularTotales } from "../../domain/factura/totales.js";

/** Mapea el tipo de documento al código de tipo usado en el consecutivo/clave. */
const TIPO_CONSECUTIVO: Record<TipoDocumento, TipoComprobante> = {
  [TipoDocumento.FacturaElectronica]: TipoComprobante.FacturaElectronica,
  [TipoDocumento.TiqueteElectronico]: TipoComprobante.TiqueteElectronico,
  [TipoDocumento.NotaCredito]: TipoComprobante.NotaCredito,
  [TipoDocumento.NotaDebito]: TipoComprobante.NotaDebito,
};
import type { Certificado } from "../firma/certificado.js";
import { construirEnvelope } from "./envelope.js";
import type { EstadoResult, EnvioResult } from "./reception.js";

/** Datos de la factura sin los campos que el orquestador calcula (clave/consecutivo). */
export type DatosFactura = Omit<FacturaInput, "clave" | "numeroConsecutivo"> & {
  cedulaEmisor: string;
  sucursal?: number;
  terminal?: number;
  consecutivo: number;
};

export interface EmisionDeps {
  /** Devuelve un access token válido para el emisor. */
  obtenerToken: () => Promise<string>;
  /** Firma el XML y devuelve el XML firmado. */
  firmar: (xml: string, cert: Certificado) => Promise<string>;
  cliente: {
    enviar: (token: string, envelope: ReturnType<typeof construirEnvelope>) => Promise<EnvioResult>;
    esperarEstadoFinal: (token: string, clave: string) => Promise<EstadoResult>;
  };
  certificado: Certificado;
}

export interface EmisionResult {
  clave: string;
  consecutivo: string;
  xmlFirmado: string;
  envio: EnvioResult;
  estado: EstadoResult;
  /** Total del comprobante y su moneda, para persistirlos junto al registro. */
  total: number;
  moneda: string;
}

/** Ejecuta el flujo completo de emisión de un comprobante electrónico. */
export async function emitirComprobante(
  tipo: TipoDocumento,
  datos: DatosFactura,
  deps: EmisionDeps,
): Promise<EmisionResult> {
  const fecha = datos.fechaEmision ?? new Date();

  // 1. Clave numérica (el tipo determina los 2 dígitos del consecutivo)
  const { clave, consecutivo } = generarClave({
    cedulaEmisor: datos.cedulaEmisor,
    sucursal: datos.sucursal ?? 1,
    terminal: datos.terminal ?? 1,
    tipo: TIPO_CONSECUTIVO[tipo],
    consecutivo: datos.consecutivo,
    situacion: SituacionComprobante.Normal,
    fecha,
  });

  // 2. XML
  const facturaInput: FacturaInput = {
    ...datos,
    clave,
    numeroConsecutivo: consecutivo,
    fechaEmision: fecha,
  };
  const xml = generarComprobanteXml(tipo, facturaInput);
  // Ya está calculado aquí: guardarlo evita tener que reparsear el XML después
  // para poder sumar importes.
  const { resumen } = calcularTotales(facturaInput);

  // 3. Firma
  const xmlFirmado = await deps.firmar(xml, deps.certificado);

  // 4. Envío + espera de estado
  const token = await deps.obtenerToken();
  const envelope = construirEnvelope(xmlFirmado, {
    clave,
    fecha: fechaEmisionISO(fecha),
    emisor: datos.emisor.identificacion,
    receptor: datos.receptor?.identificacion,
  });

  const envio = await deps.cliente.enviar(token, envelope);
  const estado = await deps.cliente.esperarEstadoFinal(token, clave);

  return {
    clave,
    consecutivo,
    xmlFirmado,
    envio,
    estado,
    total: resumen.totalComprobante,
    moneda: datos.moneda?.codigo ?? "CRC",
  };
}

/** Emite una Factura Electrónica (atajo de `emitirComprobante`). */
export function emitirFactura(datos: DatosFactura, deps: EmisionDeps): Promise<EmisionResult> {
  return emitirComprobante(TipoDocumento.FacturaElectronica, datos, deps);
}
