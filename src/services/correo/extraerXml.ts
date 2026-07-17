/**
 * Extracción de comprobantes XML desde los adjuntos de un correo.
 *
 * Lógica pura (sin red): recibe los adjuntos ya parseados (mailparser) y
 * devuelve el contenido de los que parecen un comprobante electrónico. Así se
 * puede probar sin un servidor IMAP.
 */

export interface AdjuntoCorreo {
  filename?: string;
  contentType?: string;
  content: Buffer;
}

/** ¿El adjunto parece un XML de comprobante? */
export function esAdjuntoXml(adjunto: AdjuntoCorreo): boolean {
  const nombre = (adjunto.filename ?? "").toLowerCase();
  const tipo = (adjunto.contentType ?? "").toLowerCase();
  if (nombre.endsWith(".xml")) return true;
  if (tipo.includes("xml")) return true;
  return false;
}

/**
 * Devuelve el contenido (texto) de los adjuntos XML que además contienen un
 * comprobante emitido (no un MensajeReceptor ni una respuesta de Hacienda).
 */
export function extraerComprobantesXml(adjuntos: AdjuntoCorreo[]): string[] {
  const comprobantes: string[] = [];
  for (const adjunto of adjuntos) {
    if (!esAdjuntoXml(adjunto)) continue;
    const texto = adjunto.content.toString("utf8").trim();
    if (!texto.startsWith("<")) continue;
    // Solo los comprobantes emitidos (los que uno recibe para responder).
    if (/<(FacturaElectronica|TiqueteElectronico|NotaCreditoElectronica|NotaDebitoElectronica)\b/.test(texto)) {
      comprobantes.push(texto);
    }
  }
  return comprobantes;
}
