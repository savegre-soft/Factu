/**
 * Contratos del módulo de Notificaciones. El punto de extensión es
 * `NotificationProvider` (patrón Strategy): agregar un proveedor nuevo es
 * implementar esta interfaz y registrarlo, sin tocar la lógica de negocio.
 */

export type ChannelType = "sms" | "whatsapp" | "slack" | "teams" | "bitrix24";
export type ProviderKey = "twilio" | "whatsapp_cloud" | "slack" | "teams" | "bitrix24";

/** Un campo de configuración que un proveedor necesita (para la UI dinámica). */
export interface CampoConfig {
  clave: string;
  etiqueta: string;
  tipo: "text" | "password" | "tel" | "url";
  requerido: boolean;
  ayuda?: string;
  /** true si es secreto: no se devuelve al cliente una vez guardado. */
  secreto?: boolean;
}

/** Mensaje ya renderizado, listo para que un proveedor lo entregue. */
export interface MensajeSaliente {
  evento: string;
  contenido: string;
  datos: Record<string, unknown>;
}

/** Resultado de un intento de envío por un proveedor. */
export interface ProviderResult {
  ok: boolean;
  /** Id del mensaje en el proveedor (Twilio SID, WhatsApp message id, etc.). */
  proveedorMensajeId?: string | null;
  /** Respuesta cruda del proveedor (se guarda en el historial). */
  respuesta?: unknown;
  error?: string | null;
  /** false = error definitivo (no reintentar); por defecto se asume reintentable. */
  reintentable?: boolean;
  /** Destino efectivo (para mostrar en el historial). */
  destino?: string | null;
}

/**
 * Strategy de proveedor. Cada proveedor concreto (Twilio, WhatsApp Cloud,
 * Slack, Teams) implementa `enviar`. La config llega ya descifrada.
 */
export interface NotificationProvider {
  readonly clave: ProviderKey;
  readonly canal: ChannelType;
  readonly nombre: string;
  /** Metadatos de los campos de configuración (credenciales + destino). */
  readonly campos: CampoConfig[];
  enviar(mensaje: MensajeSaliente, config: Record<string, unknown>): Promise<ProviderResult>;
}
