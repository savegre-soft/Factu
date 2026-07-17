/** Composición del módulo de Notificaciones + helper para disparar eventos. */
import { env } from "../../config/env.js";
import {
  notificationChannelRepository,
  notificationMessageRepository,
  masterKey,
} from "../../infra/repos/index.js";
import { NotificacionesService } from "./notificacionesService.js";
import { ProviderRegistry } from "./registry.js";
import { TwilioSmsProvider } from "./providers/twilioSms.js";
import { WhatsappCloudProvider } from "./providers/whatsappCloud.js";
import { SlackProvider } from "./providers/slack.js";
import { TeamsProvider } from "./providers/teams.js";
import { Bitrix24Provider } from "./providers/bitrix24.js";

/** Registro de proveedores. Agregar uno nuevo es registrarlo aquí. */
export const providerRegistry = new ProviderRegistry();
providerRegistry.registrar(new TwilioSmsProvider());
providerRegistry.registrar(new WhatsappCloudProvider());
providerRegistry.registrar(new SlackProvider());
providerRegistry.registrar(new TeamsProvider());
providerRegistry.registrar(new Bitrix24Provider());

export const notificacionesService = new NotificacionesService(
  notificationChannelRepository,
  notificationMessageRepository,
  providerRegistry,
  masterKey(),
  { habilitado: env.NOTIF_ENABLED, maxIntentos: env.NOTIF_MAX_INTENTOS },
);

/**
 * Dispara un evento hacia las notificaciones sin bloquear ni romper al emisor.
 * Se llama junto a los eventos que el sistema ya emite hoy.
 */
export function notificarEvento(
  tenantId: string,
  evento: string,
  datos: Record<string, unknown>,
): void {
  void notificacionesService.emitir(tenantId, evento, datos).catch(() => {});
}

export * from "./tipos.js";
export { EVENTOS_NOTIFICACION } from "./eventos.js";
