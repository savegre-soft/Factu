import { describe, it, expect, vi } from "vitest";
import { HaciendaAuthClient, HaciendaAuthError } from "./haciendaAuth.js";

const IDP_URL = "https://idp.example.go.cr/auth/realms/rut-stag/protocol/openid-connect/token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const OK_TOKEN = {
  access_token: "AT",
  refresh_token: "RT",
  expires_in: 300,
  refresh_expires_in: 1800,
  token_type: "Bearer",
};

describe("HaciendaAuthClient.login", () => {
  it("envía password grant y normaliza los tiempos de expiración", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(OK_TOKEN));
    const client = new HaciendaAuthClient({
      idpTokenUrl: IDP_URL,
      clientId: "api-stag",
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => 1_000_000,
    });

    const tokens = await client.login("user@hacienda.cr", "secret");

    expect(tokens.accessToken).toBe("AT");
    expect(tokens.refreshToken).toBe("RT");
    expect(tokens.accessExpiresAt).toBe(1_000_000 + 300_000);
    expect(tokens.refreshExpiresAt).toBe(1_000_000 + 1_800_000);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(IDP_URL);
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("password");
    expect(body.get("client_id")).toBe("api-stag");
    expect(body.get("username")).toBe("user@hacienda.cr");
    expect(body.get("password")).toBe("secret");
  });

  it("lanza HaciendaAuthError con credenciales inválidas", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 401));
    const client = new HaciendaAuthClient({
      idpTokenUrl: IDP_URL,
      clientId: "api-stag",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.login("u", "bad")).rejects.toBeInstanceOf(HaciendaAuthError);
  });
});

describe("HaciendaAuthClient.refresh", () => {
  it("envía refresh_token grant", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(OK_TOKEN));
    const client = new HaciendaAuthClient({
      idpTokenUrl: IDP_URL,
      clientId: "api-stag",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.refresh("RT-old");
    const body = new URLSearchParams(fetchFn.mock.calls[0]![1].body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("RT-old");
  });
});

describe("HaciendaAuthClient.logout", () => {
  it("apunta al endpoint de logout derivado del de token", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new HaciendaAuthClient({
      idpTokenUrl: IDP_URL,
      clientId: "api-stag",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.logout("RT");
    const [url] = fetchFn.mock.calls[0]!;
    expect(url).toBe(IDP_URL.replace("/token", "/logout"));
  });
});
