import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { facturaXmlSchema } from "../plugins/schemas.js";
import {
  generarClave,
  TipoComprobante,
  SituacionComprobante,
} from "../domain/clave/clave.js";
import { generarFacturaXml } from "../domain/factura/facturaXml.js";
import { env } from "../config/env.js";
import {
  CodigoDescuento,
  CondicionVenta,
  TipoIdentificacion,
  CodigoImpuesto,
  TipoExoneracion,
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

const lineaSchema = z.object({
  codigoCabys: z.string().length(13),
  cantidad: z.number().positive(),
  unidadMedida: z.string(),
  detalle: z.string(),
  precioUnitario: z.number().nonnegative(),
  esServicio: z.boolean().optional(),
  descuentos: z
    .array(
      z.object({
        monto: z.number().nonnegative(),
        // Obligatorio en el XML v4.4; si no viene, el generador usa "07".
        codigo: z.nativeEnum(CodigoDescuento).optional(),
        codigoOtro: z.string().optional(),
        naturaleza: z.string(),
      }),
    )
    .optional(),
  impuestos: z
    .array(
      z.object({
        codigo: z.nativeEnum(CodigoImpuesto),
        codigoTarifa: z.string(),
        tarifa: z.number().nonnegative(),
        // Rebaja el impuesto: zonas francas, diplomáticos, instituciones…
        exoneracion: z
          .object({
            tipoDocumento: z.nativeEnum(TipoExoneracion),
            tipoDocumentoOtro: z.string().optional(),
            numeroDocumento: z.string().min(3).max(40),
            articulo: z.number().int().optional(),
            inciso: z.number().int().optional(),
            nombreInstitucion: z.string().length(2),
            nombreInstitucionOtros: z.string().optional(),
            fechaEmision: z.coerce.date(),
            tarifaExonerada: z.number().min(0).max(100),
          })
          .optional(),
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
   * Número consecutivo. Si se omite, la API reserva el siguiente de la serie
   * (emisor + sucursal + terminal + tipo); pasarlo explícitamente lo fuerza.
   */
  consecutivo: z.number().int().nonnegative().optional(),
  /**
   * "1" normal, "2" contingencia, "3" sin internet. En contingencia el
   * comprobante se emite igual y se transmite cuando el servicio vuelva.
   */
  situacion: z.nativeEnum(SituacionComprobante).optional(),
  // Datos de la factura (hito 3)
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
        tipoDocOtro: z.string().optional(),
        numero: z.string(),
        fechaEmision: z.coerce.date(),
        codigo: z.string(),
        codigoOtro: z.string().optional(),
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

    const { clave, consecutivo } = generarClave({
      cedulaEmisor: b.cedulaEmisor,
      sucursal: b.sucursal,
      terminal: b.terminal,
      tipo: TipoComprobante.FacturaElectronica,
      // La vista previa no consume número de la serie: si no viene, se muestra 1.
      consecutivo: b.consecutivo ?? 1,
      situacion: b.situacion ?? SituacionComprobante.Normal,
    });

    const input: FacturaInput = {
      clave,
      proveedorSistemas: env.PROVEEDOR_SISTEMAS,
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
