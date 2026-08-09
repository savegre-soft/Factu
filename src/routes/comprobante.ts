import type { FastifyInstance } from "fastify";
import { datosFacturaSchema } from "./factura.js";
import { tokenStore, SinSesionHaciendaError } from "../services/auth/index.js";
import { receptionClient, emitirComprobante } from "../services/hacienda/index.js";
import { firmar } from "../services/firma/index.js";
import { generarP12Autofirmado, type Certificado } from "../services/firma/certificado.js";
import { certStore } from "../services/emisor/index.js";
import { comprobanteRepository, emisorRepository, clienteRepository } from "../infra/repos/index.js";
import { randomUUID } from "node:crypto";
import { documentosRecibidosService } from "../services/documentosRecibidos/index.js";
import { entregaService } from "../services/entrega/index.js";
import { emitirEvento } from "../services/webhooks/index.js";
import { notificarEvento } from "../services/notificaciones/index.js";
import { registrarAuditoria, actorDesde } from "../services/auditoria/index.js";
import { TipoDocumento } from "../domain/factura/facturaXml.js";
import { validarComprobante } from "../domain/validacion/validacion.js";
import { env } from "../config/env.js";
import {
  comprobanteEnviarSchema,
  comprobanteGetSchema,
  comprobantesListarSchema,
  comprobanteReenviarSchema,
  comprobanteEnviosSchema,
} from "../plugins/schemas.js";
import { z } from "zod";
import { Permiso } from "../domain/auth/roles.js";
import { emisorDelTenant } from "./_guards.js";
import type { DatosFactura } from "../services/hacienda/emision.js";

/** Mapea el segmento de la ruta al tipo de documento. */
const RUTA_A_TIPO: Record<string, TipoDocumento> = {
  factura: TipoDocumento.FacturaElectronica,
  tiquete: TipoDocumento.TiqueteElectronico,
  "nota-credito": TipoDocumento.NotaCredito,
  "nota-debito": TipoDocumento.NotaDebito,
};

export async function comprobanteRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Emite un comprobante de punta a punta: clave → XML → firma → envío → estado.
   * `tipo` ∈ { factura, tiquete, nota-credito, nota-debito }.
   *
   * Requisitos: haber hecho /auth/login para el emisor (la clave del token es la
   * cédula del emisor) y tener HACIENDA_API_URL configurada.
   *
   * ⚠️ Por ahora firma con un certificado autofirmado de PRUEBA. La carga del .p12
   * real del emisor es parte de la gestión de emisores (pendiente).
   */
  app.post(
    "/comprobante/:tipo/enviar",
    { schema: comprobanteEnviarSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
    const tipoParam = (request.params as { tipo: string }).tipo;
    const tipo = RUTA_A_TIPO[tipoParam];
    if (!tipo) {
      return reply.status(404).send({
        error: `Tipo de comprobante desconocido: "${tipoParam}"`,
        tiposValidos: Object.keys(RUTA_A_TIPO),
      });
    }

    const parsed = datosFacturaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    // El consecutivo es opcional en la entrada: lo resuelve la API más abajo.
    const datos = parsed.data as Omit<DatosFactura, "consecutivo"> & { consecutivo?: number };
    // ProveedorSistemas (v4.4): usa el configurado en la plataforma; si no hay,
    // el generador cae en la cédula del propio emisor.
    if (!datos.proveedorSistemas) datos.proveedorSistemas = env.PROVEEDOR_SISTEMAS;

    // El emisor debe estar registrado y pertenecer al tenant del usuario.
    if (!(await emisorDelTenant(request, reply, datos.cedulaEmisor))) return;

    // Validación de reglas de negocio antes de firmar/enviar (falla temprano).
    const errores = validarComprobante(tipo, datos);
    if (errores.length > 0) {
      return reply.status(400).send({ error: "Comprobante inválido", errores });
    }

    // El consecutivo lo lleva la API, no el cliente: si el navegador lo
    // manejara, una recarga o una segunda pestaña repetirían el número y
    // Hacienda rechazaría el comprobante. Se acepta uno explícito como override.
    const serie = {
      cedulaEmisor: datos.cedulaEmisor,
      sucursal: datos.sucursal ?? 1,
      terminal: datos.terminal ?? 1,
      tipo,
    };
    const consecutivoAsignado =
      datos.consecutivo ?? (await comprobanteRepository.reservarConsecutivo(serie));

    // Usa el certificado real del emisor si está cargado; si no, cae a uno
    // autofirmado de PRUEBA (marcado en la respuesta).
    let certificado: Certificado;
    let certificadoDemo = false;
    if (await certStore.tieneCertificado(datos.cedulaEmisor)) {
      certificado = await certStore.obtenerCertificado(datos.cedulaEmisor);
    } else {
      certificado = generarP12Autofirmado({
        password: "demo",
        commonName: datos.emisor.nombre,
        cedula: datos.cedulaEmisor,
      }).certificado;
      certificadoDemo = true;
    }

    // Emisión ante Hacienda. Todo lo que va DESPUÉS de este bloque ocurre con el
    // comprobante ya emitido: ningún fallo posterior puede reportarse como
    // "fallo al emitir", o el usuario reintentaría y duplicaría el documento.
    let result;
    // Mientras esto sea false, Hacienda no ha visto nada y el consecutivo que
    // se reservó se puede devolver a la serie.
    let entregado = false;
    try {
      result = await emitirComprobante(tipo, { ...datos, consecutivo: consecutivoAsignado }, {
        obtenerToken: () => tokenStore.getAccessToken(datos.cedulaEmisor),
        firmar,
        cliente: receptionClient,
        certificado,
        alEntregarAHacienda: () => {
          entregado = true;
        },
      });
    } catch (err) {
      // Falló antes de entregarlo: se devuelve el número para no dejar un hueco
      // en la serie. Si ya se entregó, el número está consumido y no se toca.
      if (!entregado && datos.consecutivo === undefined) {
        await comprobanteRepository
          .liberarConsecutivo(serie, consecutivoAsignado)
          .catch((e) => request.log.warn({ err: e }, "No se pudo liberar el consecutivo"));
      }
      // Sin sesión con el IDP no es un fallo de la integración: es que hay que
      // autenticar al emisor. Con 401 el cliente sabe que debe pedir credenciales.
      if (err instanceof SinSesionHaciendaError) {
        return reply.status(401).send({
          error: "Sin sesión con Hacienda",
          detalle: err.message,
          emisor: err.emisor,
        });
      }
      request.log.error(err);
      return reply.status(502).send({
        error: "Fallo al emitir el comprobante",
        detalle: (err as Error).message,
      });
    }

    {
      // Persiste el comprobante con su estado final. Si la base falla, el
      // comprobante YA existe ante Hacienda: se avisa, pero no se da por fallido.
      let persistido = true;
      try {
        await comprobanteRepository.crear({
          clave: result.clave,
          cedulaEmisor: datos.cedulaEmisor,
          tipo,
          consecutivo: result.consecutivo,
          estado: result.estado.estado,
          total: result.total,
          moneda: result.moneda,
          xmlFirmado: result.xmlFirmado,
          respuestaXml: result.estado.respuestaXml,
        });
      } catch (err) {
        persistido = false;
        request.log.error(
          { err, clave: result.clave },
          "Comprobante emitido en Hacienda pero NO persistido",
        );
      }

      // Guarda/actualiza el receptor como cliente para autocompletarlo luego.
      if (datos.receptor?.identificacion?.numero) {
        void clienteRepository
          .upsert({
            id: randomUUID(),
            tenantId: request.user.tenantId,
            numero: datos.receptor.identificacion.numero,
            tipo: datos.receptor.identificacion.tipo,
            nombre: datos.receptor.nombre,
            correo: datos.receptor.correoElectronico ?? null,
            datos: JSON.stringify(datos.receptor),
          })
          .catch((err) => request.log.warn({ err }, "No se pudo guardar el cliente receptor"));
      }

      registrarAuditoria({
        tenantId: request.user.tenantId,
        actor: actorDesde(request.user, request.ip),
        accion: "comprobante.emitir",
        recurso: "comprobante",
        recursoId: result.clave,
        detalle: `${tipoParam} ${result.consecutivo} → ${result.estado.estado}`,
      });

      // Webhook + notificaciones según el veredicto de Hacienda.
      if (result.estado.estado === "aceptado" || result.estado.estado === "rechazado") {
        const evento = `comprobante.${result.estado.estado}`;
        const datosEvento = {
          clave: result.clave,
          tipo: tipoParam,
          consecutivo: result.consecutivo,
          estado: result.estado.estado,
          cedulaEmisor: datos.cedulaEmisor,
        };
        emitirEvento(request.user.tenantId, evento, datosEvento);
        notificarEvento(request.user.tenantId, evento, datosEvento);
      }

      // Routing interno: si el receptor es un emisor registrado en Factu, el
      // comprobante aparece en sus "documentos recibidos" para que responda con
      // el mensaje receptor. Nunca debe romper la emisión.
      const cedulaReceptor = datos.receptor?.identificacion?.numero;
      if (cedulaReceptor) {
        try {
          const emisorReceptor = await emisorRepository.buscar(cedulaReceptor);
          if (emisorReceptor) {
            await documentosRecibidosService.registrarDesdeXml(
              emisorReceptor.tenantId,
              result.xmlFirmado,
              "interno",
            );
          }
        } catch (err) {
          request.log.warn({ err }, "No se pudo registrar el documento recibido (routing interno)");
        }
      }

      // Entrega al cliente: si Hacienda ACEPTÓ y el receptor tiene correo, se
      // envía el comprobante (PDF + XML). En segundo plano y con auditoría; nunca
      // rompe ni bloquea la respuesta de emisión.
      if (result.estado.estado === "aceptado" && datos.receptor?.correoElectronico) {
        void entregaService
          .entregarAlAceptar({
            tenantId: request.user.tenantId,
            clave: result.clave,
            cedulaEmisor: datos.cedulaEmisor,
            consecutivo: result.consecutivo,
            correoReceptor: datos.receptor.correoElectronico,
          })
          .catch((err) => request.log.warn({ err }, "Fallo al entregar el comprobante al cliente"));
      }

      return {
        tipo: tipoParam,
        clave: result.clave,
        consecutivo: result.consecutivo,
        envio: result.envio,
        estado: result.estado.estado,
        respuestaXml: result.estado.respuestaXml,
        certificadoDemo,
        ...(persistido
          ? {}
          : {
              advertencia:
                "El comprobante se emitió en Hacienda pero no se pudo guardar en la base. NO lo reenvíes: anota la clave.",
            }),
      };
    }
  });

  /**
   * Próximo consecutivo de una serie, sin consumirlo. Lo usa el formulario de
   * emisión para mostrar el número que se va a asignar.
   */
  app.get(
    "/comprobante/proximo-consecutivo",
    { preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const q = z
        .object({
          cedulaEmisor: z.string().min(1),
          sucursal: z.coerce.number().int().nonnegative().default(1),
          terminal: z.coerce.number().int().nonnegative().default(1),
          tipo: z.enum(["factura", "tiquete", "nota-credito", "nota-debito"]).default("factura"),
        })
        .safeParse(request.query);
      if (!q.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: q.error.issues });
      }
      if (!(await emisorDelTenant(request, reply, q.data.cedulaEmisor))) return;

      const consecutivo = await comprobanteRepository.proximoConsecutivo({
        cedulaEmisor: q.data.cedulaEmisor,
        sucursal: q.data.sucursal,
        terminal: q.data.terminal,
        tipo: RUTA_A_TIPO[q.data.tipo]!,
      });
      return { consecutivo };
    },
  );

  /** Lista los comprobantes emitidos del tenant (todos sus emisores). */
  app.get(
    "/comprobantes",
    { schema: comprobantesListarSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
      const q = z
        .object({
          limite: z.coerce.number().int().min(1).max(200).default(50),
          desplazamiento: z.coerce.number().int().min(0).default(0),
        })
        .safeParse(request.query);
      if (!q.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: q.error.issues });
      }

      const emisores = await emisorRepository.listarPorTenant(request.user.tenantId);
      const nombres = new Map(emisores.map((e) => [e.cedula, e.nombre]));

      // Un solo query paginado y sin los XML: antes era uno por emisor, traía el
      // histórico completo (~13 KB por fila) y ordenaba en memoria.
      const pagina = await comprobanteRepository.listarResumen({
        cedulasEmisor: emisores.map((e) => e.cedula),
        limite: q.data.limite,
        desplazamiento: q.data.desplazamiento,
      });

      return {
        total: pagina.total,
        limite: q.data.limite,
        desplazamiento: q.data.desplazamiento,
        items: pagina.items.map((c) => ({
          clave: c.clave,
          tipo: c.tipo,
          consecutivo: c.consecutivo,
          estado: c.estado,
          cedulaEmisor: c.cedulaEmisor,
          emisorNombre: nombres.get(c.cedulaEmisor) ?? "",
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      };
    },
  );

  /** Consulta un comprobante persistido por su clave (dentro del tenant). */
  app.get(
    "/comprobante/:clave",
    { schema: comprobanteGetSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
    const clave = (request.params as { clave: string }).clave;
    const record = await comprobanteRepository.buscar(clave);
    if (!record) return reply.status(404).send({ error: "Comprobante no encontrado" });
    // Aislamiento: el comprobante debe pertenecer a un emisor del tenant.
    if (!(await emisorDelTenant(request, reply, record.cedulaEmisor))) return;
    return {
      clave: record.clave,
      tipo: record.tipo,
      consecutivo: record.consecutivo,
      estado: record.estado,
      cedulaEmisor: record.cedulaEmisor,
      xmlFirmado: record.xmlFirmado ?? null,
      respuestaXml: record.respuestaXml ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  });

  /** Reenvía el comprobante al cliente por correo (PDF + XML). */
  app.post(
    "/comprobante/:clave/reenviar",
    { schema: comprobanteReenviarSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const clave = (request.params as { clave: string }).clave;
      const record = await comprobanteRepository.buscar(clave);
      if (!record) return reply.status(404).send({ error: "Comprobante no encontrado" });
      if (!(await emisorDelTenant(request, reply, record.cedulaEmisor))) return;

      const correo = z
        .object({ correo: z.string().email().optional() })
        .safeParse(request.body ?? {});
      try {
        const envio = await entregaService.reenviar(
          request.user.tenantId,
          clave,
          correo.success ? correo.data.correo : undefined,
        );
        if (!envio) return reply.status(404).send({ error: "Comprobante no encontrado" });
        return envio;
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    },
  );

  /** Historial de envíos del comprobante al cliente. */
  app.get(
    "/comprobante/:clave/envios",
    { schema: comprobanteEnviosSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
      const clave = (request.params as { clave: string }).clave;
      const record = await comprobanteRepository.buscar(clave);
      if (!record) return reply.status(404).send({ error: "Comprobante no encontrado" });
      if (!(await emisorDelTenant(request, reply, record.cedulaEmisor))) return;
      return entregaService.historial(request.user.tenantId, clave);
    },
  );
}
