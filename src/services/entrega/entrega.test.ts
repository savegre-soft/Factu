import { describe, it, expect } from "vitest";
import { EntregaService } from "./entregaService.js";
import type { EmailSender, MensajeCorreo } from "./emailSender.js";
import {
  EnvioComprobanteRepositoryMemoria,
  ComprobanteRepositoryMemoria,
} from "../../infra/repos/memory.js";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
  <Clave>50601011800310112345600100001010000000001100000001</Clave>
  <NumeroConsecutivo>00100001010000000001</NumeroConsecutivo>
  <FechaEmision>2026-07-10T12:00:00-06:00</FechaEmision>
  <Emisor><Nombre>Empresa X S.A.</Nombre><Identificacion><Tipo>02</Tipo><Numero>3101123456</Numero></Identificacion></Emisor>
  <Receptor><Nombre>Cliente Y</Nombre><Identificacion><Tipo>01</Tipo><Numero>102340567</Numero></Identificacion><CorreoElectronico>cliente@correo.cr</CorreoElectronico></Receptor>
  <DetalleServicio><LineaDetalle><NumeroLinea>1</NumeroLinea><Detalle>Producto A</Detalle><Cantidad>1</Cantidad><PrecioUnitario>1000</PrecioUnitario><Impuesto><Tarifa>13.00</Tarifa></Impuesto><MontoTotalLinea>1130</MontoTotalLinea></LineaDetalle></DetalleServicio>
  <ResumenFactura><CodigoTipoMoneda><CodigoMoneda>CRC</CodigoMoneda></CodigoTipoMoneda><TotalVentaNeta>1000</TotalVentaNeta><TotalImpuesto>130</TotalImpuesto><TotalComprobante>1130</TotalComprobante></ResumenFactura>
</FacturaElectronica>`;

class FakeSender implements EmailSender {
  enviados: MensajeCorreo[] = [];
  fallarProximos = 0;
  puedeEnviar = true;
  async disponible(): Promise<boolean> {
    return this.puedeEnviar;
  }
  async enviar(_tenantId: string, m: MensajeCorreo): Promise<void> {
    if (this.fallarProximos > 0) {
      this.fallarProximos--;
      throw new Error("SMTP caído");
    }
    this.enviados.push(m);
  }
}

async function armar(sender: FakeSender, maxIntentos = 3) {
  const envios = new EnvioComprobanteRepositoryMemoria();
  const comprobantes = new ComprobanteRepositoryMemoria();
  await comprobantes.crear({
    clave: "50601011800310112345600100001010000000001100000001",
    cedulaEmisor: "3101123456",
    tipo: "FE",
    consecutivo: "00100001010000000001",
    estado: "aceptado",
    xmlFirmado: XML,
  });
  const svc = new EntregaService(envios, comprobantes, sender, {
    habilitado: true,
    maxIntentos,
  });
  return { svc, envios, comprobantes };
}

const CLAVE = "50601011800310112345600100001010000000001100000001";

describe("EntregaService", () => {
  it("entrega al aceptar: envía PDF + XML y audita como enviado", async () => {
    const sender = new FakeSender();
    const { svc } = await armar(sender);

    await svc.entregarAlAceptar({
      tenantId: "t1",
      clave: CLAVE,
      cedulaEmisor: "3101123456",
      consecutivo: "00100001010000000001",
      correoReceptor: "cliente@correo.cr",
    });

    expect(sender.enviados).toHaveLength(1);
    const msg = sender.enviados[0]!;
    expect(msg.to).toBe("cliente@correo.cr");
    expect(msg.subject).toContain("Factura electrónica");
    const nombres = (msg.attachments ?? []).map((a) => a.filename);
    expect(nombres.some((n) => n.endsWith(".pdf"))).toBe(true);
    expect(nombres.some((n) => n.endsWith(".xml"))).toBe(true);
    // El PDF es un buffer real que empieza con la firma %PDF.
    const pdf = (msg.attachments ?? []).find((a) => a.filename.endsWith(".pdf"))!;
    expect((pdf.content as Buffer).subarray(0, 4).toString()).toBe("%PDF");

    const hist = await svc.historial("t1", CLAVE);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.estado).toBe("enviado");
    expect(hist[0]!.intentos).toBe(1);
  });

  it("registra el fallo y luego el poller reintenta con éxito", async () => {
    const sender = new FakeSender();
    sender.fallarProximos = 1; // el primer intento falla
    const { svc } = await armar(sender);

    await svc.entregarAlAceptar({
      tenantId: "t1",
      clave: CLAVE,
      cedulaEmisor: "3101123456",
      consecutivo: "00100001010000000001",
      correoReceptor: "cliente@correo.cr",
    });

    let hist = await svc.historial("t1", CLAVE);
    expect(hist[0]!.estado).toBe("fallido");
    expect(hist[0]!.error).toContain("SMTP");
    expect(hist[0]!.intentos).toBe(1);

    // El poller reintenta; ahora el sender ya no falla.
    await svc.reintentarPendientes();

    hist = await svc.historial("t1", CLAVE);
    expect(hist[0]!.estado).toBe("enviado");
    expect(hist[0]!.intentos).toBe(2);
  });

  it("no reintenta más allá del máximo de intentos", async () => {
    const sender = new FakeSender();
    sender.fallarProximos = 99; // siempre falla
    const { svc } = await armar(sender, 2);

    await svc.entregarAlAceptar({
      tenantId: "t1",
      clave: CLAVE,
      cedulaEmisor: "3101123456",
      consecutivo: "00100001010000000001",
      correoReceptor: "cliente@correo.cr",
    });
    await svc.reintentarPendientes(); // 2º intento
    await svc.reintentarPendientes(); // ya no debería intentar (intentos=2 = max)

    const hist = await svc.historial("t1", CLAVE);
    expect(hist[0]!.intentos).toBe(2);
    expect(hist[0]!.estado).toBe("fallido");
  });

  it("no hace nada si la entrega no está activa (SMTP no disponible)", async () => {
    const sender = new FakeSender();
    sender.puedeEnviar = false;
    const { svc } = await armar(sender);

    await svc.entregarAlAceptar({
      tenantId: "t1",
      clave: CLAVE,
      cedulaEmisor: "3101123456",
      consecutivo: "00100001010000000001",
      correoReceptor: "cliente@correo.cr",
    });

    expect(await svc.historial("t1", CLAVE)).toHaveLength(0);
  });

  it("reenvío manual a un correo dado", async () => {
    const sender = new FakeSender();
    const { svc } = await armar(sender);

    const envio = await svc.reenviar("t1", CLAVE, "otro@correo.cr");
    expect(envio?.estado).toBe("enviado");
    expect(sender.enviados[0]!.to).toBe("otro@correo.cr");
  });
});
