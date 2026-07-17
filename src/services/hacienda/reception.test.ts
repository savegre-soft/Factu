import { describe, it, expect, vi } from "vitest";
import { HaciendaReceptionClient, HaciendaReceptionError } from "./reception.js";
import { xmlToBase64, type ReceptionEnvelope } from "./envelope.js";

const API = "https://api-sandbox.example.go.cr/recepcion/v1";

const envelope: ReceptionEnvelope = {
  clave: "5".repeat(50),
  fecha: "2026-07-16T12:00:00-06:00",
  emisor: { tipoIdentificacion: "02", numeroIdentificacion: "3101123456" },
  comprobanteXml: xmlToBase64("<Factura/>"),
};

function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("HaciendaReceptionClient.enviar", () => {
  it("hace POST con el token y devuelve la Location en un 202", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: { Location: `${API}/recepcion/${envelope.clave}` },
      }),
    );
    const client = new HaciendaReceptionClient({ apiUrl: API, fetchFn: fetchFn as never });

    const res = await client.enviar("TOKEN123", envelope);

    expect(res.status).toBe(202);
    expect(res.location).toBe(`${API}/recepcion/${envelope.clave}`);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${API}/recepcion`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer TOKEN123");
    expect(JSON.parse(init.body).clave).toBe(envelope.clave);
  });

  it("lanza HaciendaReceptionError ante un 400", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ mensaje: "clave inválida" }, 400));
    const client = new HaciendaReceptionClient({ apiUrl: API, fetchFn: fetchFn as never });

    await expect(client.enviar("T", envelope)).rejects.toBeInstanceOf(HaciendaReceptionError);
  });
});

describe("HaciendaReceptionClient.consultarEstado", () => {
  it("normaliza ind-estado y decodifica la respuesta-xml", async () => {
    const respuestaXml = "<MensajeHacienda>Aceptado</MensajeHacienda>";
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes({
        clave: envelope.clave,
        "ind-estado": "aceptado",
        "respuesta-xml": xmlToBase64(respuestaXml),
      }),
    );
    const client = new HaciendaReceptionClient({ apiUrl: API, fetchFn: fetchFn as never });

    const estado = await client.consultarEstado("T", envelope.clave);

    expect(estado.estado).toBe("aceptado");
    expect(estado.respuestaXml).toBe(respuestaXml);
    expect(fetchFn.mock.calls[0]![0]).toBe(`${API}/recepcion/${envelope.clave}`);
  });

  it("mapea estados desconocidos a 'desconocido'", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ "ind-estado": "algo-raro" }));
    const client = new HaciendaReceptionClient({ apiUrl: API, fetchFn: fetchFn as never });
    const estado = await client.consultarEstado("T", envelope.clave);
    expect(estado.estado).toBe("desconocido");
  });
});

describe("HaciendaReceptionClient.esperarEstadoFinal", () => {
  it("reintenta mientras el estado no es definitivo y devuelve el final", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ "ind-estado": "recibido" }))
      .mockResolvedValueOnce(jsonRes({ "ind-estado": "procesando" }))
      .mockResolvedValueOnce(jsonRes({ "ind-estado": "aceptado" }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new HaciendaReceptionClient({
      apiUrl: API,
      fetchFn: fetchFn as never,
      sleep,
    });

    const estado = await client.esperarEstadoFinal("T", envelope.clave, { intentos: 5 });

    expect(estado.estado).toBe("aceptado");
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2); // no duerme tras el estado final
  });

  it("se rinde tras agotar los intentos devolviendo el último estado", async () => {
    // Fábrica: un Response nuevo por llamada (el body solo se lee una vez).
    const fetchFn = vi.fn().mockImplementation(async () => jsonRes({ "ind-estado": "procesando" }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new HaciendaReceptionClient({
      apiUrl: API,
      fetchFn: fetchFn as never,
      sleep,
    });

    const estado = await client.esperarEstadoFinal("T", envelope.clave, { intentos: 3 });

    expect(estado.estado).toBe("procesando");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
