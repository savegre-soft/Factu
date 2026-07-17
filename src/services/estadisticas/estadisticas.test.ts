import { describe, it, expect, beforeEach } from "vitest";
import { EstadisticasService } from "./estadisticasService.js";
import {
  ComprobanteRepositoryMemoria,
  EmisorRepositoryMemoria,
  UsuarioRepositoryMemoria,
} from "../../infra/repos/memory.js";
import { Rol } from "../../domain/auth/roles.js";

const TENANT = "tenant-a";
const OTRO_TENANT = "tenant-b";

describe("EstadisticasService", () => {
  let usuarios: UsuarioRepositoryMemoria;
  let emisores: EmisorRepositoryMemoria;
  let comprobantes: ComprobanteRepositoryMemoria;
  let service: EstadisticasService;

  /** Crea un comprobante y le fija la fecha de creación (para probar rangos). */
  async function emitir(cedula: string, tipo: string, estado: string, fecha?: string) {
    const clave = `${cedula}-${tipo}-${estado}-${fecha ?? "hoy"}-${Math.random()}`;
    const rec = await comprobantes.crear({
      clave, cedulaEmisor: cedula, tipo, consecutivo: "1", estado,
    });
    if (fecha) {
      const guardado = await comprobantes.buscar(clave);
      Object.assign(guardado!, { createdAt: new Date(fecha) });
    }
    return rec;
  }

  beforeEach(async () => {
    usuarios = new UsuarioRepositoryMemoria();
    emisores = new EmisorRepositoryMemoria();
    comprobantes = new ComprobanteRepositoryMemoria();
    service = new EstadisticasService(usuarios, emisores, comprobantes);

    await usuarios.crear({ id: "u1", tenantId: TENANT, email: "a@x.cr", nombre: "A", passwordHash: "h", rol: Rol.Admin });
    await usuarios.crear({ id: "u2", tenantId: TENANT, email: "b@x.cr", nombre: "B", passwordHash: "h", rol: Rol.Facturador });
    await usuarios.crear({ id: "u3", tenantId: OTRO_TENANT, email: "c@y.cr", nombre: "C", passwordHash: "h", rol: Rol.Admin });

    await emisores.upsert({ cedula: "111", tenantId: TENANT, nombre: "Emisor Uno" });
    await emisores.upsert({ cedula: "222", tenantId: TENANT, nombre: "Emisor Dos" });
    await emisores.upsert({ cedula: "999", tenantId: OTRO_TENANT, nombre: "Ajeno" });

    await emitir("111", "FE", "aceptado", "2026-07-01T10:00:00Z");
    await emitir("111", "FE", "rechazado", "2026-07-01T12:00:00Z");
    await emitir("222", "TE", "aceptado", "2026-07-05T10:00:00Z");
    await emitir("999", "FE", "aceptado", "2026-07-05T10:00:00Z"); // otro tenant
  });

  it("resume usuarios, emisores y comprobantes del tenant", async () => {
    const resumen = await service.resumen(TENANT);
    expect(resumen.usuarios).toEqual({ total: 2, porRol: { admin: 1, facturador: 1 } });
    expect(resumen.emisores).toEqual({ total: 2, conCertificado: 0 });
    expect(resumen.comprobantes.total).toBe(3);
    expect(resumen.comprobantes.porEstado).toEqual({ aceptado: 2, rechazado: 1 });
    expect(resumen.comprobantes.porTipo).toEqual({ FE: 2, TE: 1 });
    expect(resumen.comprobantes.ultimaEmision).toEqual(new Date("2026-07-05T10:00:00Z"));
  });

  it("no cuenta datos de otros tenants", async () => {
    const resumen = await service.resumen(OTRO_TENANT);
    expect(resumen.usuarios.total).toBe(1);
    expect(resumen.emisores.total).toBe(1);
    expect(resumen.comprobantes.total).toBe(1);
  });

  it("cuenta los emisores con certificado cargado", async () => {
    const sellado = { iv: "x", tag: "y", datos: "z" } as never;
    await emisores.guardarCertificado("111", { p12: sellado, password: sellado });
    const resumen = await service.resumen(TENANT);
    expect(resumen.emisores.conCertificado).toBe(1);
  });

  it("filtra por rango de fechas", async () => {
    const resumen = await service.resumen(TENANT, { desde: new Date("2026-07-04T00:00:00Z") });
    expect(resumen.comprobantes.total).toBe(1);
    expect(resumen.comprobantes.porTipo).toEqual({ TE: 1 });

    const cerrado = await service.resumen(TENANT, {
      desde: new Date("2026-07-01T00:00:00Z"),
      hasta: new Date("2026-07-01T23:59:59Z"),
    });
    expect(cerrado.comprobantes.total).toBe(2);
  });

  it("un tenant vacío devuelve ceros y sin última emisión", async () => {
    const resumen = await service.resumen("tenant-sin-datos");
    expect(resumen.comprobantes.total).toBe(0);
    expect(resumen.comprobantes.ultimaEmision).toBeNull();
    expect(resumen.emisores.total).toBe(0);
  });

  it("desglosa por emisor", async () => {
    const porEmisor = await service.porEmisor(TENANT);
    expect(porEmisor).toHaveLength(2);
    const uno = porEmisor.find((e) => e.cedula === "111");
    expect(uno?.nombre).toBe("Emisor Uno");
    expect(uno?.comprobantes.total).toBe(2);
    expect(uno?.comprobantes.porEstado).toEqual({ aceptado: 1, rechazado: 1 });
  });

  it("arma la serie diaria ordenada", async () => {
    const serie = await service.serieDiaria(TENANT);
    expect(serie).toEqual([
      { fecha: "2026-07-01", total: 2 },
      { fecha: "2026-07-05", total: 1 },
    ]);
  });
});
