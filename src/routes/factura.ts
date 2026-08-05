import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { facturaXmlSchema } from "../plugins/schemas.js";
import {
  generarClave,
  TipoComprobante,
  SituacionComprobante,
} from "../domain/clave/clave.js";
import { generarFacturaXml } from "../domain/factura/facturaXml.js";
import {
  CondicionVenta,
  TipoIdentificacion,
  CodigoImpuesto,
  TipoMedioPago,
  type FacturaInput,
} from "../domain/factura/types.js";

const identificacionSchema = z.object({
  tipo: z.nativeEnum(TipoIdentificacion),
  numero: z.string().regex(/^\d+$/),
});

const ubicacionSchema = z.object({
  provincia: z.string(),
  canton: z.string(),
  distrito: z.string(),
  barrio: z.string().optional(),
  otrasSenas: z.string(),
});

const exoneracionSchema = z.object({
  tipoDocumento: z.string(),
  numeroDocumento: z.string(),
  nombreInstitucion: z.string(),
  nombreInstitucionOtros: z.string().optional(),
  fechaEmisionDocumento: z.coerce.date(),
  porcentajeExoneracion: z.number(),
  montoExoneracion: z.number(),
});

const lineaSchema = z.object({
  codigoCabys: z.string().length(13),
  cantidad: z.number().positive(),
  unidadMedida: z.string(),
  detalle: z.string(),
  precioUnitario: z.number().nonnegative(),
  esServicio: z.boolean().optional(),
  descuentos: z
    .array(z.object({ monto: z.number().nonnegative(), naturaleza: z.string() }))
    .optional(),
  impuestos: z
    .array(
      z.object({
        codigo: z.nativeEnum(CodigoImpuesto),
        codigoTarifa: z.string(),
        tarifa: z.number().nonnegative(),
        exoneracion: exoneracionSchema.optional(),
      }),
    )
    .optional(),
});

export const datosFacturaSchema = z.object({
  // Datos para generar la clave (hito 1)
  cedulaEmisor: z.string().regex(/^\d+$/),
  sucursal: z.number().int().nonnegative().default(1),
  terminal: z.number().int().nonnegative().default(1),
  /**
   * Opcional desde D9: si se omite, `/comprobante/:tipo/enviar` lo asigna de
   * forma atómica server-side (ver `consecutivoRepository`). `/factura/xml`
   * (esta ruta, solo genera el XML sin persistir nada) sigue exigiéndolo
   * explícito, ya que no tiene emisor real de donde resolverlo.
   */
  consecutivo: z.number().int().nonnegative().optional(),
  /**
   * Idempotencia (reconciliación de RestroCloud, RF-58): id opaco del
   * sistema externo. Si `/comprobante/:tipo/enviar` ya emitió algo con esta
   * misma (cedulaEmisor, referenciaExterna), devuelve ese comprobante en vez
   * de crear uno nuevo — protege contra reintentos duplicando un documento
   * fiscal real. Sin efecto en `/factura/xml` (no persiste nada).
   */
  referenciaExterna: z.string().max(150).optional(),
  // Datos de la factura (hito 3)
  /** Cédula del proveedor de sistemas (v4.4, obligatorio). Si se omite, se usa la del emisor. */
  proveedorSistemas: z.string().max(20).optional(),
  codigoActividadEmisor: z.string(),
  codigoActividadReceptor: z.string().optional(),
  emisor: z.object({
    nombre: z.string(),
    identificacion: identificacionSchema,
    nombreComercial: z.string().optional(),
    ubicacion: ubicacionSchema,
    telefono: z.object({ codigoPais: z.string(), numTelefono: z.string() }).optional(),
    correoElectronico: z.string().email(),
  }),
  receptor: z
    .object({
      nombre: z.string(),
      identificacion: identificacionSchema,
      nombreComercial: z.string().optional(),
      ubicacion: ubicacionSchema.optional(),
      correoElectronico: z.string().email().optional(),
    })
    .optional(),
  condicionVenta: z.nativeEnum(CondicionVenta).default(CondicionVenta.Contado),
  plazoCredito: z.string().optional(),
  moneda: z
    .object({ codigo: z.string(), tipoCambio: z.number().positive().optional() })
    .optional(),
  lineas: z.array(lineaSchema).min(1),
  mediosPago: z
    .array(z.object({ tipo: z.nativeEnum(TipoMedioPago), monto: z.number().optional() }))
    .optional(),
  informacionReferencia: z
    .array(
      z.object({
        tipoDoc: z.string(),
        numero: z.string(),
        fechaEmision: z.coerce.date(),
        codigo: z.string(),
        razon: z.string(),
      }),
    )
    .optional(),
});

export async function facturaRoutes(app: FastifyInstance): Promise<void> {
  app.post("/factura/xml", { schema: facturaXmlSchema }, async (request, reply) => {
    const parsed = datosFacturaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const b = parsed.data;
    // Esta ruta solo genera el XML sin persistir nada — no hay emisor real del
    // que resolver un consecutivo atómico (eso es `/comprobante/:tipo/enviar`),
    // así que aquí sigue siendo obligatorio pese a ser opcional en el schema.
    if (b.consecutivo === undefined) {
      return reply.status(400).send({
        error: "Entrada inválida",
        detalles: [{ path: ["consecutivo"], message: "Obligatorio para generar el XML sin persistir" }],
      });
    }

    const { clave, consecutivo } = generarClave({
      cedulaEmisor: b.cedulaEmisor,
      sucursal: b.sucursal,
      terminal: b.terminal,
      tipo: TipoComprobante.FacturaElectronica,
      consecutivo: b.consecutivo,
      situacion: SituacionComprobante.Normal,
    });

    const input: FacturaInput = {
      clave,
      numeroConsecutivo: consecutivo,
      codigoActividadEmisor: b.codigoActividadEmisor,
      codigoActividadReceptor: b.codigoActividadReceptor,
      emisor: b.emisor,
      receptor: b.receptor,
      condicionVenta: b.condicionVenta,
      plazoCredito: b.plazoCredito,
      moneda: b.moneda,
      lineas: b.lineas,
      mediosPago: b.mediosPago,
    };

    const xml = generarFacturaXml(input);
    return reply.header("Content-Type", "application/xml; charset=utf-8").send(xml);
  });
}
