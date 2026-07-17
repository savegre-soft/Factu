/**
 * Cliente de la API de recepción de comprobantes electrónicos de Hacienda.
 *
 *   POST {apiUrl}/recepcion          → envía el comprobante (responde 202 + Location)
 *   GET  {apiUrl}/recepcion/{clave}  → consulta el estado del comprobante
 *
 * El estado ("ind-estado") evoluciona: recibido → procesando → aceptado | rechazado.
 * Todas las llamadas requieren el access token del IDP (hito 2).
 */
import type { ReceptionEnvelope } from "./envelope.js";
import { base64ToXml } from "./envelope.js";

/** Estados posibles que devuelve Hacienda, normalizados. */
export type EstadoComprobante =
  | "recibido"
  | "procesando"
  | "aceptado"
  | "rechazado"
  | "error"
  | "desconocido";

export interface EnvioResult {
  status: number;
  /** URL de consulta de estado (header Location), si Hacienda la entrega. */
  location?: string;
}

export interface EstadoResult {
  clave: string;
  estado: EstadoComprobante;
  /** XML de respuesta (Mensaje Hacienda) ya decodificado, si está disponible. */
  respuestaXml?: string;
  raw: unknown;
}

export interface ReceptionConfig {
  /** URL base de recepción, ej. https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1 */
  apiUrl: string;
  fetchFn?: typeof fetch;
  /** Pausa inyectable para el polling (tests). */
  sleep?: (ms: number) => Promise<void>;
}

export class HaciendaReceptionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "HaciendaReceptionError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function normalizarEstado(valor: unknown): EstadoComprobante {
  const s = String(valor ?? "").toLowerCase();
  if (s === "aceptado" || s === "rechazado" || s === "recibido" || s === "procesando") {
    return s;
  }
  if (s === "error") return "error";
  return "desconocido";
}

export class HaciendaReceptionClient {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly config: ReceptionConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.sleep = config.sleep ?? defaultSleep;
  }

  /** Envía un comprobante a recepción. */
  async enviar(accessToken: string, envelope: ReceptionEnvelope): Promise<EnvioResult> {
    const res = await this.fetchFn(`${this.config.apiUrl}/recepcion`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelope),
    });

    // Hacienda responde 202 Accepted cuando recibe el comprobante para procesar.
    if (res.status !== 202 && res.status !== 200) {
      const body = await safeBody(res);
      throw new HaciendaReceptionError(
        `Envío rechazado por Hacienda (${res.status})`,
        res.status,
        body,
      );
    }

    return {
      status: res.status,
      location: res.headers.get("location") ?? undefined,
    };
  }

  /** Consulta el estado actual de un comprobante por su clave. */
  async consultarEstado(accessToken: string, clave: string): Promise<EstadoResult> {
    const res = await this.fetchFn(`${this.config.apiUrl}/recepcion/${clave}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await safeBody(res);
      throw new HaciendaReceptionError(
        `Consulta de estado falló (${res.status})`,
        res.status,
        body,
      );
    }

    const data = (await res.json()) as Record<string, unknown>;
    const respuestaB64 = data["respuesta-xml"] as string | undefined;

    return {
      clave: (data["clave"] as string) ?? clave,
      estado: normalizarEstado(data["ind-estado"]),
      respuestaXml: respuestaB64 ? base64ToXml(respuestaB64) : undefined,
      raw: data,
    };
  }

  /**
   * Consulta el estado repetidamente hasta que sea definitivo (aceptado/rechazado)
   * o se agoten los intentos.
   */
  async esperarEstadoFinal(
    accessToken: string,
    clave: string,
    opts: { intentos?: number; intervaloMs?: number } = {},
  ): Promise<EstadoResult> {
    const intentos = opts.intentos ?? 5;
    const intervaloMs = opts.intervaloMs ?? 3000;

    let ultimo: EstadoResult | undefined;
    for (let i = 0; i < intentos; i++) {
      ultimo = await this.consultarEstado(accessToken, clave);
      if (ultimo.estado === "aceptado" || ultimo.estado === "rechazado") {
        return ultimo;
      }
      if (i < intentos - 1) await this.sleep(intervaloMs);
    }
    return ultimo!;
  }
}

async function safeBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
