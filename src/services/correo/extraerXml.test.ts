import { describe, it, expect } from "vitest";
import { esAdjuntoXml, extraerComprobantesXml, type AdjuntoCorreo } from "./extraerXml.js";

function adj(filename: string, contentType: string, texto: string): AdjuntoCorreo {
  return { filename, contentType, content: Buffer.from(texto, "utf8") };
}

const FE = `<?xml version="1.0"?><FacturaElectronica xmlns="x"><Clave>1</Clave></FacturaElectronica>`;
const MR = `<?xml version="1.0"?><MensajeReceptor xmlns="x"><Clave>1</Clave></MensajeReceptor>`;

describe("extraerXml", () => {
  it("reconoce adjuntos XML por extensión o content-type", () => {
    expect(esAdjuntoXml(adj("factura.xml", "application/octet-stream", FE))).toBe(true);
    expect(esAdjuntoXml(adj("factura", "text/xml", FE))).toBe(true);
    expect(esAdjuntoXml(adj("logo.png", "image/png", ""))).toBe(false);
  });

  it("extrae solo los comprobantes emitidos (ignora MR, PDF, imágenes)", () => {
    const adjuntos: AdjuntoCorreo[] = [
      adj("factura.xml", "text/xml", FE),
      adj("respuesta.xml", "text/xml", MR),
      adj("factura.pdf", "application/pdf", "%PDF-1.4"),
      adj("logo.png", "image/png", "binario"),
    ];
    const xmls = extraerComprobantesXml(adjuntos);
    expect(xmls).toHaveLength(1);
    expect(xmls[0]).toContain("FacturaElectronica");
  });

  it("ignora XML que no empiezan con <", () => {
    expect(extraerComprobantesXml([adj("x.xml", "text/xml", "  no es xml")])).toHaveLength(0);
  });
});
