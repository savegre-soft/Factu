import { describe, it, expect } from "vitest";
import { DocumentosRecibidosService } from "./documentosRecibidosService.js";
import { DocumentoRecibidoRepositoryMemoria } from "../../infra/repos/memory.js";
import { RespuestaMensaje } from "../../domain/mensajeReceptor/mensajeReceptor.js";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
  <Clave>50601011800310112345600100001010000000001100000001</Clave>
  <NumeroConsecutivo>00100001010000000001</NumeroConsecutivo>
  <FechaEmision>2026-07-10T12:00:00-06:00</FechaEmision>
  <Emisor><Nombre>Proveedora S.A.</Nombre><Identificacion><Tipo>02</Tipo><Numero>3101888888</Numero></Identificacion></Emisor>
  <Receptor><Nombre>Mi Empresa S.A.</Nombre><Identificacion><Tipo>02</Tipo><Numero>3101123456</Numero></Identificacion></Receptor>
  <ResumenFactura><TotalImpuesto>130.00000</TotalImpuesto><TotalComprobante>1130.00000</TotalComprobante></ResumenFactura>
</FacturaElectronica>`;

function servicio() {
  return new DocumentosRecibidosService(new DocumentoRecibidoRepositoryMemoria());
}

describe("DocumentosRecibidosService", () => {
  it("registra un documento desde el XML y no lo duplica por clave", async () => {
    const svc = servicio();
    const r1 = await svc.registrarDesdeXml("t1", XML, "manual");
    expect(r1.yaExistia).toBe(false);
    expect(r1.documento.emisorCedula).toBe("3101888888");
    expect(r1.documento.receptorCedula).toBe("3101123456");
    expect(r1.documento.totalComprobante).toBeCloseTo(1130);

    const r2 = await svc.registrarDesdeXml("t1", XML, "correo");
    expect(r2.yaExistia).toBe(true);
    expect(r2.documento.id).toBe(r1.documento.id);
  });

  it("aísla por tenant", async () => {
    const svc = servicio();
    const r = await svc.registrarDesdeXml("t1", XML, "manual");
    expect(await svc.obtener("t1", r.documento.id)).not.toBeNull();
    expect(await svc.obtener("otro", r.documento.id)).toBeNull();
  });

  it("genera y guarda el mensaje receptor", async () => {
    const svc = servicio();
    const { documento } = await svc.registrarDesdeXml("t1", XML, "manual");

    const actualizado = await svc.generarMensajeReceptor("t1", documento.id, {
      respuesta: RespuestaMensaje.Aceptado,
      detalleMensaje: "Conforme",
    });

    expect(actualizado).not.toBeNull();
    expect(actualizado!.mrRespuesta).toBe(RespuestaMensaje.Aceptado);
    expect(actualizado!.mrConsecutivo).toHaveLength(20);
    expect(actualizado!.mrXml).toContain("<MensajeReceptor");
    expect(actualizado!.mrXml).toContain("50601011800310112345600100001010000000001100000001");
  });

  it("no genera MR para un documento de otro tenant", async () => {
    const svc = servicio();
    const { documento } = await svc.registrarDesdeXml("t1", XML, "manual");
    const r = await svc.generarMensajeReceptor("otro", documento.id, {
      respuesta: RespuestaMensaje.Rechazado,
    });
    expect(r).toBeNull();
  });
});
