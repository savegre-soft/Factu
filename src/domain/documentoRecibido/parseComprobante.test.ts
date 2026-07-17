import { describe, it, expect } from "vitest";
import { parsearComprobante } from "./parseComprobante.js";

const XML_FE = `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
  <Clave>50601011800310112345600100001010000000001100000001</Clave>
  <ProveedorSistemas>3101999999</ProveedorSistemas>
  <NumeroConsecutivo>00100001010000000001</NumeroConsecutivo>
  <FechaEmision>2026-07-10T12:00:00-06:00</FechaEmision>
  <Emisor>
    <Nombre>Proveedora S.A.</Nombre>
    <Identificacion>
      <Tipo>02</Tipo>
      <Numero>3101888888</Numero>
    </Identificacion>
  </Emisor>
  <Receptor>
    <Nombre>Mi Empresa S.A.</Nombre>
    <Identificacion>
      <Tipo>02</Tipo>
      <Numero>3101123456</Numero>
    </Identificacion>
  </Receptor>
  <ResumenFactura>
    <CodigoTipoMoneda><CodigoMoneda>CRC</CodigoMoneda></CodigoTipoMoneda>
    <TotalImpuesto>130.00000</TotalImpuesto>
    <TotalComprobante>1130.00000</TotalComprobante>
  </ResumenFactura>
</FacturaElectronica>`;

describe("parsearComprobante", () => {
  it("extrae los datos clave de una factura recibida", () => {
    const d = parsearComprobante(XML_FE);
    expect(d.tipo).toBe("FE");
    expect(d.clave).toHaveLength(50);
    expect(d.numeroConsecutivo).toBe("00100001010000000001");
    expect(d.emisorNombre).toBe("Proveedora S.A.");
    expect(d.emisorIdentificacion.numero).toBe("3101888888");
    expect(d.receptorNombre).toBe("Mi Empresa S.A.");
    expect(d.receptorIdentificacion?.numero).toBe("3101123456");
    expect(d.moneda).toBe("CRC");
    expect(d.totalComprobante).toBeCloseTo(1130);
    expect(d.totalImpuesto).toBeCloseTo(130);
  });

  it("distingue el tipo por el elemento raíz", () => {
    const nc = XML_FE.replace(/FacturaElectronica/g, "NotaCreditoElectronica");
    expect(parsearComprobante(nc).tipo).toBe("NC");
  });

  it("lanza si el XML no tiene Clave", () => {
    expect(() => parsearComprobante("<Otro><x/></Otro>")).toThrow();
  });
});
