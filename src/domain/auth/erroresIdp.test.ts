import { describe, it, expect } from "vitest";
import { esCredencialInvalida } from "./erroresIdp.js";

describe("esCredencialInvalida", () => {
  it("401 del IDP: credenciales", () => {
    expect(esCredencialInvalida(401, { error: "unauthorized" })).toBe(true);
  });

  it("400 invalid_grant: es el caso típico de usuario o clave mal escritos", () => {
    expect(
      esCredencialInvalida(400, {
        error: "invalid_grant",
        error_description: "Invalid user credentials",
      }),
    ).toBe(true);
  });

  it("reconoce invalid_grant aunque el cuerpo venga como texto", () => {
    expect(esCredencialInvalida(400, '{"error":"invalid_grant"}')).toBe(true);
  });

  it("invalid_client también es un problema de credenciales", () => {
    expect(esCredencialInvalida(400, { error: "invalid_client" })).toBe(true);
  });

  it("otros 400 no son de credenciales: son un fallo de la integración", () => {
    expect(esCredencialInvalida(400, { error: "unsupported_grant_type" })).toBe(false);
  });

  it("500 o 503 del IDP nunca son culpa de las credenciales", () => {
    expect(esCredencialInvalida(500, "Internal Server Error")).toBe(false);
    expect(esCredencialInvalida(503, null)).toBe(false);
  });

  it("no revienta con cuerpos raros", () => {
    expect(esCredencialInvalida(400, null)).toBe(false);
    expect(esCredencialInvalida(400, undefined)).toBe(false);
    expect(esCredencialInvalida(400, 42)).toBe(false);
  });
});
