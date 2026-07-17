import { describe, it, expect, beforeEach } from "vitest";
import { ChatService } from "./chatService.js";
import { MensajeRepositoryMemoria, UsuarioRepositoryMemoria } from "../../infra/repos/memory.js";
import { Rol } from "../../domain/auth/roles.js";

async function armar() {
  const mensajes = new MensajeRepositoryMemoria();
  const usuarios = new UsuarioRepositoryMemoria();
  await usuarios.crear({ id: "ana", tenantId: "t1", email: "ana@x.cr", nombre: "Ana", passwordHash: "x", rol: Rol.Admin });
  await usuarios.crear({ id: "beto", tenantId: "t1", email: "beto@x.cr", nombre: "Beto", passwordHash: "x", rol: Rol.Facturador });
  await usuarios.crear({ id: "otro", tenantId: "t2", email: "otro@x.cr", nombre: "Otro", passwordHash: "x", rol: Rol.Admin });
  return { svc: new ChatService(mensajes, usuarios), mensajes, usuarios };
}

describe("ChatService", () => {
  let svc: ChatService;
  beforeEach(async () => {
    svc = (await armar()).svc;
  });

  it("envía y recupera la conversación entre dos usuarios del tenant", async () => {
    await svc.enviar("t1", "ana", "beto", "Hola Beto");
    await svc.enviar("t1", "beto", "ana", "¡Hola Ana!");

    const conv = await svc.conversacion("t1", "ana", "beto");
    expect(conv.map((m) => m.texto)).toEqual(["Hola Beto", "¡Hola Ana!"]);
  });

  it("cuenta no leídos y los marca al abrir la conversación", async () => {
    await svc.enviar("t1", "beto", "ana", "1");
    await svc.enviar("t1", "beto", "ana", "2");

    expect(await svc.totalNoLeidos("t1", "ana")).toBe(2);
    const contactos = await svc.contactos("t1", "ana");
    expect(contactos.find((c) => c.id === "beto")?.noLeidos).toBe(2);

    await svc.marcarLeidos("t1", "ana", "beto");
    expect(await svc.totalNoLeidos("t1", "ana")).toBe(0);
  });

  it("lista contactos del tenant (sin uno mismo ni otros tenants)", async () => {
    const contactos = await svc.contactos("t1", "ana");
    expect(contactos.map((c) => c.id).sort()).toEqual(["beto"]);
  });

  it("no permite escribir a usuarios de otro tenant", async () => {
    await expect(svc.enviar("t1", "ana", "otro", "hola")).rejects.toThrow();
  });

  it("no permite escribirse a uno mismo ni mensajes vacíos", async () => {
    await expect(svc.enviar("t1", "ana", "ana", "hola")).rejects.toThrow();
    await expect(svc.enviar("t1", "ana", "beto", "   ")).rejects.toThrow();
  });
});
