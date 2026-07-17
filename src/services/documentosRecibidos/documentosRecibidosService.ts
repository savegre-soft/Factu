/**
 * Documentos recibidos: las facturas que NOS emiten, para responder con el
 * mensaje receptor.
 *
 * Un documento se registra a partir de su XML (carga manual, routing interno al
 * emitir, o correo). Desde él se genera el mensaje receptor (aceptación,
 * aceptación parcial o rechazo), que se guarda asociado al documento.
 */
import { randomUUID } from "node:crypto";
import { parsearComprobante } from "../../domain/documentoRecibido/parseComprobante.js";
import {
  generarMensajeReceptorXml,
  RespuestaMensaje,
} from "../../domain/mensajeReceptor/mensajeReceptor.js";
import { generarConsecutivo, TipoComprobante } from "../../domain/clave/clave.js";
import type {
  DocumentoRecibidoRecord,
  DocumentoRecibidoRepository,
} from "../../infra/repos/types.js";
import { emitirEvento } from "../webhooks/index.js";
import { notificarEvento } from "../notificaciones/index.js";

export type OrigenDocumento = "manual" | "interno" | "correo";

export interface ResultadoRegistro {
  documento: DocumentoRecibidoRecord;
  /** true si ya existía (mismo tenant + clave); no se duplica. */
  yaExistia: boolean;
}

export interface DatosMensajeReceptor {
  respuesta: RespuestaMensaje;
  detalleMensaje?: string;
}

export class DocumentosRecibidosService {
  constructor(private readonly repo: DocumentoRecibidoRepository) {}

  /**
   * Registra un comprobante recibido a partir de su XML. Deduplica por clave
   * dentro del tenant: si ya existe, devuelve el existente sin crear otro.
   */
  async registrarDesdeXml(
    tenantId: string,
    xml: string,
    origen: OrigenDocumento,
  ): Promise<ResultadoRegistro> {
    const datos = parsearComprobante(xml);

    const existente = await this.repo.buscarPorClave(tenantId, datos.clave);
    if (existente) return { documento: existente, yaExistia: true };

    const documento = await this.repo.crear({
      id: randomUUID(),
      tenantId,
      clave: datos.clave,
      tipo: datos.tipo,
      numeroConsecutivo: datos.numeroConsecutivo,
      fechaEmision: new Date(datos.fechaEmision),
      emisorNombre: datos.emisorNombre,
      emisorCedula: datos.emisorIdentificacion.numero,
      receptorCedula: datos.receptorIdentificacion?.numero ?? "",
      receptorNombre: datos.receptorNombre ?? null,
      moneda: datos.moneda,
      totalComprobante: datos.totalComprobante,
      totalImpuesto: datos.totalImpuesto,
      xml,
      origen,
    });

    const datosEvento = {
      clave: documento.clave,
      tipo: documento.tipo,
      emisorNombre: documento.emisorNombre,
      emisorCedula: documento.emisorCedula,
      moneda: documento.moneda,
      totalComprobante: documento.totalComprobante,
      origen,
    };
    emitirEvento(tenantId, "documento.recibido", datosEvento);
    notificarEvento(tenantId, "documento.recibido", datosEvento);

    return { documento, yaExistia: false };
  }

  async listar(tenantId: string): Promise<DocumentoRecibidoRecord[]> {
    return this.repo.listarPorTenant(tenantId);
  }

  /** Devuelve un documento del tenant, o null si no existe o es de otro tenant. */
  async obtener(tenantId: string, id: string): Promise<DocumentoRecibidoRecord | null> {
    const doc = await this.repo.buscarPorId(id);
    return doc && doc.tenantId === tenantId ? doc : null;
  }

  /** Elimina un documento del tenant. Devuelve false si no existe o es de otro tenant. */
  async eliminar(tenantId: string, id: string): Promise<boolean> {
    const doc = await this.repo.buscarPorId(id);
    if (!doc || doc.tenantId !== tenantId) return false;
    await this.repo.eliminar(id);
    return true;
  }

  /**
   * Genera (y guarda) el mensaje receptor de un documento recibido del tenant.
   * Devuelve null si el documento no existe o es de otro tenant.
   *
   * El consecutivo del receptor se genera de forma secuencial simple por tenant.
   */
  async generarMensajeReceptor(
    tenantId: string,
    id: string,
    datos: DatosMensajeReceptor,
  ): Promise<DocumentoRecibidoRecord | null> {
    const doc = await this.repo.buscarPorId(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    if (!doc.receptorCedula) {
      throw new Error("El documento no tiene cédula de receptor; no se puede generar el mensaje");
    }

    const consecutivo = await this.siguienteConsecutivoReceptor(tenantId);

    const xml = generarMensajeReceptorXml({
      clave: doc.clave,
      numeroCedulaEmisor: doc.emisorCedula,
      fechaEmisionDoc: doc.fechaEmision,
      mensaje: datos.respuesta,
      detalleMensaje: datos.detalleMensaje,
      montoTotalImpuesto: doc.totalImpuesto,
      totalFactura: doc.totalComprobante,
      numeroCedulaReceptor: doc.receptorCedula,
      numeroConsecutivoReceptor: consecutivo,
    });

    await this.repo.guardarMensajeReceptor(id, {
      respuesta: datos.respuesta,
      consecutivo,
      xml,
    });

    return this.repo.buscarPorId(id);
  }

  /** Consecutivo de mensaje receptor (tipo 05), secuencial por tenant. */
  private async siguienteConsecutivoReceptor(tenantId: string): Promise<string> {
    const docs = await this.repo.listarPorTenant(tenantId);
    const respondidos = docs.filter((d) => d.mrConsecutivo).length;
    return generarConsecutivo({
      sucursal: 1,
      terminal: 1,
      tipo: TipoComprobante.MensajeReceptor,
      consecutivo: respondidos + 1,
    });
  }
}
