/**
 * Implementación Prisma/PostgreSQL de los repositorios (para producción).
 *
 * Se importa de forma perezosa (solo cuando PERSISTENCIA=prisma) para no exigir
 * un cliente generado ni una base de datos cuando se usa el backend en memoria.
 *
 * Requiere: `npm run prisma:generate` y una base con las migraciones aplicadas.
 */
import { PrismaClient } from "@prisma/client";
import type { Rol } from "../../domain/auth/roles.js";
import type {
  CertificadoSellado,
  ComprobanteRecord,
  ComprobanteRepository,
  EmisorRecord,
  EmisorRepository,
  NuevoComprobante,
  TenantRecord,
  TenantRepository,
  UsuarioRecord,
  UsuarioRepository,
} from "./types.js";

export const prisma = new PrismaClient();

export class TenantRepositoryPrisma implements TenantRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: { id: string; nombre: string }): Promise<TenantRecord> {
    return this.db.tenant.create({ data: input });
  }

  async buscar(id: string): Promise<TenantRecord | null> {
    return this.db.tenant.findUnique({ where: { id } });
  }
}

export class UsuarioRepositoryPrisma implements UsuarioRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: Omit<UsuarioRecord, "createdAt">): Promise<UsuarioRecord> {
    const row = await this.db.usuario.create({ data: input });
    return { ...row, rol: row.rol as Rol };
  }

  async buscarPorEmail(email: string): Promise<UsuarioRecord | null> {
    const row = await this.db.usuario.findUnique({ where: { email: email.toLowerCase() } });
    return row ? { ...row, rol: row.rol as Rol } : null;
  }

  async buscarPorId(id: string): Promise<UsuarioRecord | null> {
    const row = await this.db.usuario.findUnique({ where: { id } });
    return row ? { ...row, rol: row.rol as Rol } : null;
  }

  async listarPorTenant(tenantId: string): Promise<UsuarioRecord[]> {
    const rows = await this.db.usuario.findMany({ where: { tenantId } });
    return rows.map((r) => ({ ...r, rol: r.rol as Rol }));
  }
}

type EmisorRow = {
  cedula: string;
  tenantId: string;
  nombre: string;
  certP12: string | null;
  certPassword: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function aEmisorRecord(row: EmisorRow): EmisorRecord {
  const record: EmisorRecord = {
    cedula: row.cedula,
    tenantId: row.tenantId,
    nombre: row.nombre,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.certP12 && row.certPassword) {
    record.certificado = {
      p12: JSON.parse(row.certP12) as CertificadoSellado["p12"],
      password: JSON.parse(row.certPassword) as CertificadoSellado["password"],
    };
  }
  return record;
}

export class EmisorRepositoryPrisma implements EmisorRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(input: { cedula: string; tenantId: string; nombre: string }): Promise<EmisorRecord> {
    const row = await this.db.emisor.upsert({
      where: { cedula: input.cedula },
      create: { cedula: input.cedula, tenantId: input.tenantId, nombre: input.nombre },
      update: { nombre: input.nombre },
    });
    return aEmisorRecord(row);
  }

  async buscar(cedula: string): Promise<EmisorRecord | null> {
    const row = await this.db.emisor.findUnique({ where: { cedula } });
    return row ? aEmisorRecord(row) : null;
  }

  async listarPorTenant(tenantId: string): Promise<EmisorRecord[]> {
    const rows = await this.db.emisor.findMany({ where: { tenantId } });
    return rows.map(aEmisorRecord);
  }

  async guardarCertificado(cedula: string, cert: CertificadoSellado): Promise<void> {
    await this.db.emisor.update({
      where: { cedula },
      data: { certP12: JSON.stringify(cert.p12), certPassword: JSON.stringify(cert.password) },
    });
  }
}

export class ComprobanteRepositoryPrisma implements ComprobanteRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(rec: NuevoComprobante): Promise<ComprobanteRecord> {
    const row = await this.db.comprobante.create({
      data: {
        clave: rec.clave,
        cedulaEmisor: rec.cedulaEmisor,
        tipo: rec.tipo,
        consecutivo: rec.consecutivo,
        estado: rec.estado,
        xmlFirmado: rec.xmlFirmado ?? null,
        respuestaXml: rec.respuestaXml ?? null,
      },
    });
    return aComprobanteRecord(row);
  }

  async actualizarEstado(clave: string, estado: string, respuestaXml?: string): Promise<void> {
    await this.db.comprobante.update({
      where: { clave },
      data: { estado, ...(respuestaXml !== undefined ? { respuestaXml } : {}) },
    });
  }

  async buscar(clave: string): Promise<ComprobanteRecord | null> {
    const row = await this.db.comprobante.findUnique({ where: { clave } });
    return row ? aComprobanteRecord(row) : null;
  }

  async listarPorEmisor(cedula: string): Promise<ComprobanteRecord[]> {
    const rows = await this.db.comprobante.findMany({ where: { cedulaEmisor: cedula } });
    return rows.map(aComprobanteRecord);
  }
}

type ComprobanteRow = {
  clave: string;
  cedulaEmisor: string;
  tipo: string;
  consecutivo: string;
  estado: string;
  xmlFirmado: string | null;
  respuestaXml: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function aComprobanteRecord(row: ComprobanteRow): ComprobanteRecord {
  const record: ComprobanteRecord = {
    clave: row.clave,
    cedulaEmisor: row.cedulaEmisor,
    tipo: row.tipo,
    consecutivo: row.consecutivo,
    estado: row.estado,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.xmlFirmado) record.xmlFirmado = row.xmlFirmado;
  if (row.respuestaXml) record.respuestaXml = row.respuestaXml;
  return record;
}
