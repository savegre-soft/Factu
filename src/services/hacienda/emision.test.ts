import { describe, it, expect, vi } from "vitest";
import { emitirFactura, type DatosFactura, type EmisionDeps } from "./emision.js";
import { base64ToXml } from "./envelope.js";
import { CodigoImpuesto, CondicionVenta, TipoIdentificacion } from "../../domain/factura/types.js";
import type { Certificado } from "../firma/certificado.js";

const certificadoFake: Certificado = {
  privateKeyPem: "PEM",
  certificatePem: "CERT",
  certificateDerBase64: "DER",
};

function datos(): DatosFactura {
  return {
    cedulaEmisor: "3101123456",
    consecutivo: 1,
    codigoActividadEmisor: "620100",
    fechaEmision: new Date(Date.UTC(2026, 6, 16, 18, 0, 0)),
    emisor: {
      nombre: "Empresa X S.A.",
      identificacion: { tipo: TipoIdentificacion.Juridica, numero: "3101123456" },
      ubicacion: { provincia: "1", canton: "01", distrito: "01", otrasSenas: "Centro" },
      correoElectronico: "facturas@empresa.cr",
    },
    receptor: {
      nombre: "Cliente Y",
      identificacion: { tipo: TipoIdentificacion.Fisica, numero: "102340567" },
    },
    condicionVenta: CondicionVenta.Contado,
    lineas: [
      {
        codigoCabys: "8399000000000",
        cantidad: 1,
        unidadMedida: "Unid",
        detalle: "Producto A",
        precioUnitario: 1000,
        impuestos: [{ codigo: CodigoImpuesto.IVA, codigoTarifa: "08", tarifa: 13 }],
      },
    ],
  };
}

function deps(overrides: Partial<EmisionDeps> = {}): EmisionDeps {
  return {
    obtenerToken: vi.fn().mockResolvedValue("TOKEN"),
    firmar: vi.fn().mockImplementation(async (xml: string) => `<Signed>${xml}</Signed>`),
    cliente: {
      enviar: vi.fn().mockResolvedValue({ status: 202, location: "loc" }),
      esperarEstadoFinal: vi
        .fn()
        .mockResolvedValue({ clave: "x", estado: "aceptado", raw: {} }),
    },
    certificado: certificadoFake,
    ...overrides,
  };
}

describe("emitirFactura", () => {
  it("ejecuta el flujo completo y devuelve clave, XML firmado y estado", async () => {
    const d = deps();
    const result = await emitirFactura(datos(), d);

    expect(result.clave).toHaveLength(50);
    expect(result.consecutivo).toBe("00100001010000000001");
    expect(result.xmlFirmado).toContain("<Signed>");
    expect(result.estado.estado).toBe("aceptado");

    // Se firmó y se envió con el token.
    expect(d.firmar).toHaveBeenCalledOnce();
    expect(d.cliente.enviar).toHaveBeenCalledWith("TOKEN", expect.objectContaining({ clave: result.clave }));
  });

  it("envía el sobre con el XML firmado codificado en base64", async () => {
    const enviar = vi.fn().mockResolvedValue({ status: 202 });
    const d = deps({
      cliente: {
        enviar,
        esperarEstadoFinal: vi.fn().mockResolvedValue({ clave: "x", estado: "aceptado", raw: {} }),
      },
    });

    await emitirFactura(datos(), d);

    const envelope = enviar.mock.calls[0]![1];
    expect(base64ToXml(envelope.comprobanteXml)).toContain("<Signed>");
    expect(envelope.emisor.numeroIdentificacion).toBe("3101123456");
    expect(envelope.receptor.numeroIdentificacion).toBe("102340567");
  });

  it("propaga un estado 'rechazado'", async () => {
    const d = deps({
      cliente: {
        enviar: vi.fn().mockResolvedValue({ status: 202 }),
        esperarEstadoFinal: vi
          .fn()
          .mockResolvedValue({ clave: "x", estado: "rechazado", respuestaXml: "<Rechazo/>", raw: {} }),
      },
    });

    const result = await emitirFactura(datos(), d);
    expect(result.estado.estado).toBe("rechazado");
    expect(result.estado.respuestaXml).toBe("<Rechazo/>");
  });
});
