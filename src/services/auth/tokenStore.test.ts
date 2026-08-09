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
    expect(await store.has("EMISOR")).toBe(false);
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
    expect(await store.has("EMISOR")).toBe(false);
  });

  describe("respaldo persistente", () => {
    /** Almacén de mentira: un Map, como haría la base. */
    function almacenFalso() {
      const datos = new Map<string, TokenSet>();
      return {
        datos,
        guardar: vi.fn(async (k: string, t: TokenSet) => void datos.set(k, t)),
        leer: vi.fn(async (k: string) => datos.get(k) ?? null),
        borrar: vi.fn(async (k: string) => void datos.delete(k)),
      };
    }

    it("guarda la sesión al iniciarla", async () => {
      const almacen = almacenFalso();
      const store = new TokenStore(auth as unknown as HaciendaAuthClient, now, almacen);
      await store.login("EMISOR", "u", "p");
      expect(almacen.guardar).toHaveBeenCalledWith("EMISOR", expect.objectContaining({ accessToken: "AT" }));
    });

    it("rehidrata desde el respaldo tras un reinicio", async () => {
      const almacen = almacenFalso();
      const previo = new TokenStore(auth as unknown as HaciendaAuthClient, now, almacen);
      await previo.login("EMISOR", "u", "p");

      // Instancia nueva = proceso reiniciado: el Map arranca vacío.
      const store = new TokenStore(auth as unknown as HaciendaAuthClient, now, almacen);
      expect(await store.getAccessToken("EMISOR")).toBe("AT");
      expect(auth.login).toHaveBeenCalledTimes(1); // no hubo que volver a autenticar
    });

    it("respalda los tokens rotados al renovar", async () => {
      const almacen = almacenFalso();
      auth.refresh.mockResolvedValue(
        tokenSet({ accessToken: "AT2", refreshToken: "RT2", accessExpiresAt: 9_000_000 }),
      );
      const store = new TokenStore(auth as unknown as HaciendaAuthClient, now, almacen);
      await store.login("EMISOR", "u", "p");

      clock = 1_000_000 + 400_000; // venció el access, no el refresh
      expect(await store.getAccessToken("EMISOR")).toBe("AT2");
      expect(almacen.datos.get("EMISOR")?.refreshToken).toBe("RT2");
    });

    it("logout borra también el respaldo", async () => {
      const almacen = almacenFalso();
      const store = new TokenStore(auth as unknown as HaciendaAuthClient, now, almacen);
      await store.login("EMISOR", "u", "p");
      await store.logout("EMISOR");
      expect(almacen.datos.has("EMISOR")).toBe(false);
    });

    it("si el respaldo falla, la sesión sigue funcionando en memoria", async () => {
      const almacen = almacenFalso();
      almacen.guardar.mockRejectedValue(new Error("base caída"));
      const store = new TokenStore(auth as unknown as HaciendaAuthClient, now, almacen);
      await store.login("EMISOR", "u", "p");
      expect(await store.getAccessToken("EMISOR")).toBe("AT");
    });
  });
});
