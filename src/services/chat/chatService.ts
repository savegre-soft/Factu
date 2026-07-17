/**
 * Chat entre usuarios de una misma organización (tenant).
 *
 * Mensajería directa 1 a 1. Todo queda acotado al tenant: solo se puede escribir
 * a usuarios de la propia organización, y las conversaciones nunca cruzan tenants.
 */
import { randomUUID } from "node:crypto";
import type {
  MensajeRecord,
  MensajeRepository,
  UsuarioRepository,
} from "../../infra/repos/types.js";

export interface Contacto {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  /** Mensajes sin leer que este contacto me envió. */
  noLeidos: number;
  /** Vista previa del último mensaje de la conversación. */
  ultimoTexto: string | null;
  ultimoAt: Date | null;
}

export class ChatService {
  constructor(
    private readonly mensajes: MensajeRepository,
    private readonly usuarios: UsuarioRepository,
  ) {}

  /** Contactos del tenant (todos menos yo), con no leídos y último mensaje. */
  async contactos(tenantId: string, yoId: string): Promise<Contacto[]> {
    const [usuarios, mios] = await Promise.all([
      this.usuarios.listarPorTenant(tenantId),
      this.mensajes.listarDeUsuario(tenantId, yoId),
    ]);

    return usuarios
      .filter((u) => u.id !== yoId)
      .map((u) => {
        const conv = mios
          .filter((m) => m.deId === u.id || m.paraId === u.id)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const ultimo = conv[conv.length - 1];
        const noLeidos = conv.filter((m) => m.deId === u.id && m.paraId === yoId && !m.leido).length;
        return {
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          rol: u.rol,
          noLeidos,
          ultimoTexto: ultimo?.texto ?? null,
          ultimoAt: ultimo?.createdAt ?? null,
        };
      })
      .sort((a, b) => (b.ultimoAt?.getTime() ?? 0) - (a.ultimoAt?.getTime() ?? 0));
  }

  /** Total de mensajes sin leer (para el badge). */
  async totalNoLeidos(tenantId: string, yoId: string): Promise<number> {
    const mios = await this.mensajes.listarDeUsuario(tenantId, yoId);
    return mios.filter((m) => m.paraId === yoId && !m.leido).length;
  }

  /** Conversación con otro usuario del tenant (ascendente). */
  async conversacion(tenantId: string, yoId: string, otroId: string): Promise<MensajeRecord[]> {
    return this.mensajes.listarConversacion(tenantId, yoId, otroId);
  }

  /**
   * Envía un mensaje a otro usuario del tenant. Valida que el destino exista y
   * sea de la misma organización, y que no sea uno mismo.
   */
  async enviar(
    tenantId: string,
    deId: string,
    paraId: string,
    texto: string,
  ): Promise<MensajeRecord> {
    const limpio = texto.trim();
    if (!limpio) throw new Error("El mensaje está vacío");
    if (paraId === deId) throw new Error("No puedes escribirte a ti mismo");

    const destino = await this.usuarios.buscarPorId(paraId);
    if (!destino || destino.tenantId !== tenantId) {
      throw new Error("El destinatario no pertenece a tu organización");
    }

    return this.mensajes.crear({ id: randomUUID(), tenantId, deId, paraId, texto: limpio });
  }

  /** Marca como leídos los mensajes que me envió `otroId`. */
  async marcarLeidos(tenantId: string, yoId: string, otroId: string): Promise<void> {
    await this.mensajes.marcarLeidos(tenantId, otroId, yoId);
  }
}
