import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenStore } from "./tokenStore.js";
import type { HaciendaAuthClient, TokenSet } from "./haciendaAuth.js";

function tokenSet(overrides: Partial<TokenSet> = {}): TokenSet {
  return {
    accessToken: "AT",
    refreshToken: "RT",
    accessExpiresAt: 1_000_000 + 300_000,
    refreshExpiresAt: 1_000_000 + 1_800_000,
    ...overrides,
  };
}

describe("TokenStore", () => {
  let clock: number;
  const now = () => clock;
  let auth: {
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    clock = 1_000_000;
    auth = {
      login: vi.fn().mockResolvedValue(tokenSet()),
      refresh: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
    };
  });

  function makeStore() {
    return new TokenStore(auth as unknown as HaciendaAuthClient, now);
  }

  it("devuelve el access token vigente sin renovar", async () => {
    const store = makeStore();
    await store.login("EMISOR", "u", "p");

    clock = 1_000_000 + 100_000; // aún válido
    const token = await store.getAccessToken("EMISOR");

    expect(token).toBe("AT");
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it("renueva automáticamente cuando el access token está por vencer", async () => {
    auth.refresh.mockResolvedValue(
      tokenSet({ accessToken: "AT2", refreshToken: "RT2" }),
    );
    const store = makeStore();
    await store.login("EMISOR", "u", "p");

    clock = 1_000_000 + 290_000; // dentro del margen de 30s
    const token = await store.getAccessToken("EMISOR");

    expect(token).toBe("AT2");
    expect(auth.refresh).toHaveBeenCalledOnce();
    expect(auth.refresh).toHaveBeenCalledWith("RT");
  });

  it("coalesce renovaciones concurrentes en una sola llamada", async () => {
    let resolveRefresh!: (t: TokenSet) => void;
    auth.refresh.mockReturnValue(
      new Promise<TokenSet>((r) => {
        resolveRefresh = r;
      }),
    );
    const store = makeStore();
    await store.login("EMISOR", "u", "p");
    clock = 1_000_000 + 290_000;

    const p1 = store.getAccessToken("EMISOR");
    const p2 = store.getAccessToken("EMISOR");
    resolveRefresh(tokenSet({ accessToken: "AT2" }));

    expect(await p1).toBe("AT2");
    expect(await p2).toBe("AT2");
    expect(auth.refresh).toHaveBeenCalledOnce();
  });

  it("lanza si el refresh token también expiró", async () => {
    const store = makeStore();
    await store.login("EMISOR", "u", "p");

    clock = 1_000_000 + 2_000_000; // pasó incluso el refresh
    await expect(store.getAccessToken("EMISOR")).rejects.toThrow(/expiró/);
    expect(store.has("EMISOR")).toBe(false);
  });

  it("lanza si no hay sesión", async () => {
    const store = makeStore();
    await expect(store.getAccessToken("NADIE")).rejects.toThrow(/No hay sesión/);
  });

  it("logout invalida en el IDP y descarta localmente", async () => {
    const store = makeStore();
    await store.login("EMISOR", "u", "p");

    await store.logout("EMISOR");
    expect(auth.logout).toHaveBeenCalledWith("RT");
    expect(store.has("EMISOR")).toBe(false);
  });
});
