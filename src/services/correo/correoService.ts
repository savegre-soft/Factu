/**
 * Conector de correo (IMAP) por organización: revisa un buzón, extrae los XML de
 * comprobantes adjuntos y los registra como "documentos recibidos".
 *
 * La contraseña del buzón se guarda cifrada (AES-256-GCM) con la llave maestra,
 * igual que los certificados .p12.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { sellar, abrirTexto } from "../../infra/crypto/secretBox.js";
import { extraerComprobantesXml } from "./extraerXml.js";
import type { DocumentosRecibidosService } from "../documentosRecibidos/documentosRecibidosService.js";
import type { BuzonRecord, BuzonRepository } from "../../infra/repos/types.js";

/** Datos de conexión (con la contraseña en claro, solo en memoria). */
export interface ConfigConexion {
  host: string;
  port: number;
  secure: boolean;
  usuario: string;
  password: string;
  carpeta: string;
}

export interface DatosBuzon extends ConfigConexion {
  activo: boolean;
}

/** Vista pública del buzón (nunca incluye la contraseña). */
export type BuzonPublico = Omit<BuzonRecord, "passwordSellado">;

export interface ResultadoSync {
  encontrados: number;
  nuevos: number;
}

function publico(b: BuzonRecord): BuzonPublico {
  const { passwordSellado: _omit, ...resto } = b;
  return resto;
}

export class CorreoService {
  constructor(
    private readonly buzones: BuzonRepository,
    private readonly recibidos: DocumentosRecibidosService,
    private readonly masterKey: string,
  ) {}

  async obtenerBuzon(tenantId: string): Promise<BuzonPublico | null> {
    const b = await this.buzones.buscarPorTenant(tenantId);
    return b ? publico(b) : null;
  }

  async guardarBuzon(tenantId: string, datos: DatosBuzon): Promise<BuzonPublico> {
    const record = await this.buzones.upsert({
      tenantId,
      host: datos.host,
      port: datos.port,
      secure: datos.secure,
      usuario: datos.usuario,
      passwordSellado: sellar(datos.password, this.masterKey),
      carpeta: datos.carpeta || "INBOX",
      activo: datos.activo,
    });
    return publico(record);
  }

  async eliminarBuzon(tenantId: string): Promise<void> {
    await this.buzones.eliminar(tenantId);
  }

  /** Prueba la conexión IMAP (login) sin leer correos. Lanza si falla. */
  async probar(config: ConfigConexion): Promise<void> {
    const client = this.nuevoCliente(config);
    await client.connect();
    await client.logout();
  }

  /** Sincroniza el buzón de un tenant: lee no leídos, registra los XML. */
  async sincronizar(tenantId: string): Promise<ResultadoSync> {
    const buzon = await this.buzones.buscarPorTenant(tenantId);
    if (!buzon) throw new Error("No hay un buzón configurado");

    const password = abrirTexto(buzon.passwordSellado, this.masterKey);
    try {
      const xmls = await this.leerXmlsNoLeidos({ ...buzon, password });
      let nuevos = 0;
      for (const xml of xmls) {
        try {
          const r = await this.recibidos.registrarDesdeXml(tenantId, xml, "correo");
          if (!r.yaExistia) nuevos++;
        } catch {
          // Un adjunto que no es un comprobante válido se ignora.
        }
      }
      await this.buzones.actualizarEstado(tenantId, { lastSyncAt: new Date(), lastError: null });
      return { encontrados: xmls.length, nuevos };
    } catch (err) {
      await this.buzones.actualizarEstado(tenantId, { lastError: (err as Error).message });
      throw err;
    }
  }

  /** Sincroniza todos los buzones activos (usado por el poller). */
  async sincronizarTodos(): Promise<void> {
    const activos = await this.buzones.listarActivos();
    for (const buzon of activos) {
      try {
        await this.sincronizar(buzon.tenantId);
      } catch {
        // El error ya quedó en lastError; no cortamos el resto de buzones.
      }
    }
  }

  private nuevoCliente(config: ConfigConexion): ImapFlow {
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.usuario, pass: config.password },
      logger: false,
      // Un buzón muerto falla rápido en vez de colgar el poll.
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    // CRÍTICO: sin este listener, un 'error' del socket (timeout, DNS, TLS)
    // sería una excepción no controlada que tumba el proceso de la API.
    client.on("error", () => {});
    return client;
  }

  /** Lee los mensajes no vistos, extrae los XML de comprobante y los marca leídos. */
  private async leerXmlsNoLeidos(config: ConfigConexion): Promise<string[]> {
    const client = this.nuevoCliente(config);
    await client.connect();
    const xmls: string[] = [];
    const lock = await client.getMailboxLock(config.carpeta || "INBOX");
    try {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const mail = await simpleParser(msg.source);
        const adjuntos = (mail.attachments ?? []).map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          content: a.content as Buffer,
        }));
        xmls.push(...extraerComprobantesXml(adjuntos));
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return xmls;
  }
}
