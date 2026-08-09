import { describe, it, expect } from "vitest";
import { create } from "xmlbuilder2";
import { generarFacturaXml, fechaEmisionISO } from "./facturaXml.js";
import {
  CodigoDescuento,
  CodigoImpuesto,
  TipoExoneracion,
  CondicionVenta,
  TipoIdentificacion,
  TipoMedioPago,
  type FacturaInput,
} from "./types.js";

function facturaBase(): FacturaInput {
  return {
    clave: "5".repeat(50),
    numeroConsecutivo: "00100001010000000001",
    codigoActividadEmisor: "620100",
    fechaEmision: new Date(Date.UTC(2026, 6, 16, 18, 0, 0)), // 12:00 CR
    emisor: {
      nombre: "Empresa X S.A.",
      identificacion: { tipo: TipoIdentificacion.Juridica, numero: "3101123456" },
      ubicacion: { provincia: "1", canton: "01", distrito: "01", otrasSenas: "Centro" },
      correoElectronico: "facturas@empresa.cr",
    },
    receptor: {
      nombre: "Cliente Y",
      identificacion: { tipo: TipoIdentificacion.Fisica, numero: "102340567" },
      correoElectronico: "cliente@correo.cr",
    },
    condicionVenta: CondicionVenta.Contado,
    lineas: [
      {
        codigoCabys: "8399000000000",
        cantidad: 2,
        unidadMedida: "Unid",
        detalle: "Producto A",
        precioUnitario: 1000,
        impuestos: [{ codigo: CodigoImpuesto.IVA, codigoTarifa: "08", tarifa: 13 }],
      },
    ],
    mediosPago: [{ tipo: TipoMedioPago.Efectivo }],
  };
}

/** Convierte el XML a un objeto para inspeccionar nodos con comodidad. */
function parse(xml: string): any {
  return create(xml).end({ format: "object" });
}

describe("fechaEmisionISO", () => {
  it("usa el offset fijo -06:00 de Costa Rica", () => {
    const iso = fechaEmisionISO(new Date(Date.UTC(2026, 6, 16, 18, 0, 0)));
    expect(iso).toBe("2026-07-16T12:00:00-06:00");
  });
});

describe("generarFacturaXml", () => {
  it("produce XML bien formado con el namespace v4.4", () => {
    const xml = generarFacturaXml(facturaBase());
    expect(xml).toContain(
      'xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica"',
    );
    expect(() => create(xml)).not.toThrow();
  });

  it("incluye clave, consecutivo y fecha en la cabecera", () => {
    const obj = parse(generarFacturaXml(facturaBase()));
    const fe = obj.FacturaElectronica;
    expect(fe.Clave).toBe("5".repeat(50));
    expect(fe.NumeroConsecutivo).toBe("00100001010000000001");
    expect(fe.FechaEmision).toBe("2026-07-16T12:00:00-06:00");
    expect(fe.CodigoActividadEmisor).toBe("620100");
  });

  it("incluye ProveedorSistemas: usa el valor dado o cae en la cédula del emisor", () => {
    // Sin especificar: el emisor es su propio proveedor.
    const feFallback = parse(generarFacturaXml(facturaBase())).FacturaElectronica;
    expect(feFallback.ProveedorSistemas).toBe("3101123456");

    // Especificado: se usa tal cual (cédula del proveedor del software).
    const feExplicito = parse(
      generarFacturaXml({ ...facturaBase(), proveedorSistemas: "3101999999" }),
    ).FacturaElectronica;
    expect(feExplicito.ProveedorSistemas).toBe("3101999999");
  });

  it("refleja emisor y receptor", () => {
    const fe = parse(generarFacturaXml(facturaBase())).FacturaElectronica;
    expect(fe.Emisor.Nombre).toBe("Empresa X S.A.");
    expect(fe.Emisor.Identificacion.Numero).toBe("3101123456");
    expect(fe.Receptor.Nombre).toBe("Cliente Y");
  });

  it("calcula la línea y el resumen con montos a 5 decimales", () => {
    const fe = parse(generarFacturaXml(facturaBase())).FacturaElectronica;
    const linea = fe.DetalleServicio.LineaDetalle;
    expect(linea.MontoTotal).toBe("2000.00000");
    expect(linea.Impuesto.Monto).toBe("260.00000");
    expect(linea.MontoTotalLinea).toBe("2260.00000");

    // v4.4: ImpuestoAsumidoEmisorFabrica es obligatorio y va entre Impuesto e ImpuestoNeto.
    expect(linea.ImpuestoAsumidoEmisorFabrica).toBe("0.00000");
    expect(linea.ImpuestoNeto).toBe("260.00000");
    const ordenLinea = Object.keys(linea);
    expect(ordenLinea.indexOf("Impuesto")).toBeLessThan(
      ordenLinea.indexOf("ImpuestoAsumidoEmisorFabrica"),
    );
    expect(ordenLinea.indexOf("ImpuestoAsumidoEmisorFabrica")).toBeLessThan(
      ordenLinea.indexOf("ImpuestoNeto"),
    );

    const resumen = fe.ResumenFactura;
    expect(resumen.TotalGravado).toBe("2000.00000");
    expect(resumen.TotalImpuesto).toBe("260.00000");
    expect(resumen.TotalComprobante).toBe("2260.00000");
    expect(resumen.MedioPago.TipoMedioPago).toBe("01");
  });

  it("una línea sin impuestos declara igual el bloque obligatorio con tarifa 0%", () => {
    // BaseImponible, Impuesto, ImpuestoAsumidoEmisorFabrica e ImpuestoNeto no
    // llevan minOccurs="0" en el XSD v4.4: sin ellos Hacienda rechaza por esquema.
    const input = facturaBase();
    delete input.lineas[0]!.impuestos;
    const linea = parse(generarFacturaXml(input)).FacturaElectronica.DetalleServicio.LineaDetalle;

    expect(linea.BaseImponible).toBe("2000.00000");
    expect(linea.Impuesto.Codigo).toBe("01");
    expect(linea.Impuesto.CodigoTarifaIVA).toBe("01");
    expect(linea.Impuesto.Tarifa).toBe("0.00");
    expect(linea.Impuesto.Monto).toBe("0.00000");
    expect(linea.ImpuestoAsumidoEmisorFabrica).toBe("0.00000");
    expect(linea.ImpuestoNeto).toBe("0.00000");
    expect(linea.MontoTotalLinea).toBe("2000.00000");
  });

  it("el descuento lleva CodigoDescuento, obligatorio en v4.4", () => {
    const input = facturaBase();
    input.lineas[0]!.descuentos = [{ monto: 100, naturaleza: "Descuento de prueba" }];
    const linea = parse(generarFacturaXml(input)).FacturaElectronica.DetalleServicio.LineaDetalle;

    expect(linea.Descuento.MontoDescuento).toBe("100.00000");
    // Sin código explícito cae en "07" (descuento comercial).
    expect(linea.Descuento.CodigoDescuento).toBe("07");
    expect(linea.Descuento.NaturalezaDescuento).toBe("Descuento de prueba");
    const orden = Object.keys(linea.Descuento);
    expect(orden.indexOf("MontoDescuento")).toBeLessThan(orden.indexOf("CodigoDescuento"));
    expect(orden.indexOf("CodigoDescuento")).toBeLessThan(orden.indexOf("NaturalezaDescuento"));
  });

  it('el código de descuento "99" arrastra CodigoDescuentoOTRO', () => {
    const input = facturaBase();
    input.lineas[0]!.descuentos = [
      { monto: 100, codigo: CodigoDescuento.Otros, naturaleza: "Acuerdo puntual con el cliente" },
    ];
    const desc = parse(generarFacturaXml(input)).FacturaElectronica.DetalleServicio.LineaDetalle
      .Descuento;
    expect(desc.CodigoDescuento).toBe("99");
    expect(desc.CodigoDescuentoOTRO).toBe("Acuerdo puntual con el cliente");
  });

  it("una línea exonerada rebaja el impuesto y declara el respaldo", () => {
    const input = facturaBase();
    input.lineas[0]!.impuestos = [
      {
        codigo: CodigoImpuesto.IVA,
        codigoTarifa: "08",
        tarifa: 13,
        exoneracion: {
          tipoDocumento: TipoExoneracion.ZonaFranca,
          numeroDocumento: "EX-2026-0001",
          nombreInstitucion: "05",
          fechaEmision: new Date(Date.UTC(2026, 0, 15, 18, 0, 0)),
          tarifaExonerada: 13,
        },
      },
    ];
    const fe = parse(generarFacturaXml(input)).FacturaElectronica;
    const imp = fe.DetalleServicio.LineaDetalle.Impuesto;

    // El Monto sigue siendo el impuesto bruto; lo exonerado va en su nodo.
    expect(imp.Monto).toBe("260.00000");
    expect(imp.Exoneracion.TipoDocumentoEX1).toBe("08");
    expect(imp.Exoneracion.NumeroDocumento).toBe("EX-2026-0001");
    expect(imp.Exoneracion.TarifaExonerada).toBe("13.00");
    expect(imp.Exoneracion.MontoExoneracion).toBe("260.00000");

    // Exonerado al 100%: no queda impuesto que cobrar.
    expect(fe.DetalleServicio.LineaDetalle.ImpuestoNeto).toBe("0.00000");
    expect(fe.ResumenFactura.TotalImpuesto).toBe("0.00000");
    expect(fe.ResumenFactura.TotalExonerado).toBe("260.00000");
    expect(fe.ResumenFactura.TotalComprobante).toBe("2000.00000");
  });

  it("una exoneración parcial deja el resto del impuesto", () => {
    const input = facturaBase();
    input.lineas[0]!.impuestos = [
      {
        codigo: CodigoImpuesto.IVA,
        codigoTarifa: "08",
        tarifa: 13,
        exoneracion: {
          tipoDocumento: TipoExoneracion.ComprasAutorizadasDGT,
          numeroDocumento: "AUT-77",
          nombreInstitucion: "01",
          fechaEmision: new Date(Date.UTC(2026, 0, 15, 18, 0, 0)),
          tarifaExonerada: 10,
        },
      },
    ];
    const fe = parse(generarFacturaXml(input)).FacturaElectronica;
    // 13% de 2000 = 260; exonerado el 10% = 200; se cobran 60.
    expect(fe.DetalleServicio.LineaDetalle.ImpuestoNeto).toBe("60.00000");
    expect(fe.ResumenFactura.TotalExonerado).toBe("200.00000");
  });

  it("omite el receptor cuando no se proporciona (caso tiquete)", () => {
    const input = facturaBase();
    delete input.receptor;
    const fe = parse(generarFacturaXml(input)).FacturaElectronica;
    expect(fe.Receptor).toBeUndefined();
  });
});
