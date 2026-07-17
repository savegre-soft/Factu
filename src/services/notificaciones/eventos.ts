/**
 * Catálogo de eventos que pueden disparar una notificación y las plantillas de
 * texto por evento. Se reutilizan los eventos que el sistema ya emite hoy.
 */

/** Eventos disponibles (misma clave que los que ya se emiten en el sistema). */
export const EVENTOS_NOTIFICACION = {
  "comprobante.aceptado": "Comprobante aceptado por Hacienda",
  "comprobante.rechazado": "Comprobante rechazado por Hacienda",
  "documento.recibido": "Documento recibido (te emiten una factura)",
  "entrega.cliente": "Entrega del comprobante al cliente",
} as const;

export type EventoNotificacion = keyof typeof EVENTOS_NOTIFICACION;

function txt(datos: Record<string, unknown>, clave: string): string {
  const v = datos[clave];
  return v == null ? "" : String(v);
}

/** Renderiza el texto de la notificación a partir del evento y sus datos. */
export function renderizar(evento: string, datos: Record<string, unknown>): string {
  const clave = txt(datos, "clave");
  const consecutivo = txt(datos, "consecutivo");
  switch (evento) {
    case "comprobante.aceptado":
      return `✅ Comprobante ${consecutivo} ACEPTADO por Hacienda.\nClave: ${clave}`;
    case "comprobante.rechazado":
      return `❌ Comprobante ${consecutivo} RECHAZADO por Hacienda.\nClave: ${clave}`;
    case "documento.recibido":
      return `📥 Documento recibido de ${txt(datos, "emisorNombre")}.\nClave: ${clave}`;
    case "entrega.cliente":
      return `📧 Entrega al cliente ${txt(datos, "estado")} (${txt(datos, "destinatario")}).\nClave: ${clave}`;
    case "notificacion.prueba":
      return "🔔 Notificación de prueba de Factu. Si la recibes, el canal está bien configurado.";
    default:
      return `Evento ${evento}`;
  }
}
