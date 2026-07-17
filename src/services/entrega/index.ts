/** Composición del servicio de entrega y de la config SMTP. */
import { env } from "../../config/env.js";
import {
  comprobanteRepository,
  envioComprobanteRepository,
  smtpSalienteRepository,
  masterKey,
} from "../../infra/repos/index.js";
import { EntregaService } from "./entregaService.js";
import { NodemailerSender } from "./emailSender.js";
import { SmtpConfigService } from "./smtpConfigService.js";

const sender = new NodemailerSender(smtpSalienteRepository, masterKey());

export const entregaService = new EntregaService(
  envioComprobanteRepository,
  comprobanteRepository,
  sender,
  { habilitado: env.ENTREGA_ENABLED, maxIntentos: env.ENTREGA_MAX_INTENTOS },
);

export const smtpConfigService = new SmtpConfigService(
  smtpSalienteRepository,
  masterKey(),
  sender,
);

export * from "./entregaService.js";
export * from "./emailSender.js";
export * from "./smtpConfigService.js";
