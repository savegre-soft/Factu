/**
 * Composición del servicio de documentos recibidos.
 *
 * Se le inyecta lo necesario para firmar y enviar el mensaje receptor: el
 * certificado del receptor (que es uno de nuestros emisores), su sesión con el
 * IDP y el cliente de recepción.
 */
import { documentoRecibidoRepository } from "../../infra/repos/index.js";
import { certStore } from "../emisor/index.js";
import { firmar } from "../firma/index.js";
import { tokenStore } from "../auth/index.js";
import { receptionClient } from "../hacienda/index.js";
import { DocumentosRecibidosService } from "./documentosRecibidosService.js";

export const documentosRecibidosService = new DocumentosRecibidosService(
  documentoRecibidoRepository,
  {
    firmar: async (cedula, xml) => firmar(xml, await certStore.obtenerCertificado(cedula)),
    obtenerToken: (cedula) => tokenStore.getAccessToken(cedula),
    cliente: receptionClient,
  },
);

export * from "./documentosRecibidosService.js";
