import { describe, it, expect } from "vitest";
import { puedeGestionarEmisor } from "./_guards.js";
import { Rol } from "../domain/auth/roles.js";
import type { FastifyRequest } from "fastify";

function req(user: Partial<FastifyRequest["user"]>): FastifyRequest {
  return { user } as FastifyRequest;
}

describe("puedeGestionarEmisor", () => {
  it("permite a un humano admin gestionar cualquier emisor de su tenant", () => {
    expect(puedeGestionarEmisor(req({ rol: Rol.Admin }), "3101999999")).toBe(true);
  });

  it("rechaza a un humano facturador/lector (no admin)", () => {
    expect(puedeGestionarEmisor(req({ rol: Rol.Facturador }), "3101999999")).toBe(false);
    expect(puedeGestionarEmisor(req({ rol: Rol.Lector }), "3101999999")).toBe(false);
  });

  it("permite a una API key facturador scoped exactamente a esa cédula", () => {
    expect(
      puedeGestionarEmisor(req({ kind: "service", rol: Rol.Facturador, emisores: ["3101999999"] }), "3101999999"),
    ).toBe(true);
  });

  it("rechaza a una API key facturador scoped a OTRA cédula", () => {
    expect(
      puedeGestionarEmisor(req({ kind: "service", rol: Rol.Facturador, emisores: ["3102000000"] }), "3101999999"),
    ).toBe(false);
  });

  it("permite a una API key facturador sin lista de emisores (sin restricción)", () => {
    expect(puedeGestionarEmisor(req({ kind: "service", rol: Rol.Facturador, emisores: [] }), "3101999999")).toBe(
      true,
    );
  });

  it("rechaza a una API key lector aunque esté scoped a la cédula correcta", () => {
    expect(
      puedeGestionarEmisor(req({ kind: "service", rol: Rol.Lector, emisores: ["3101999999"] }), "3101999999"),
    ).toBe(false);
  });
});
