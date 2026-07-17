/**
 * Roles de usuario y sus permisos dentro de un tenant.
 *
 *  - admin:       gestiona usuarios, emisores y certificados; también emite y lee.
 *  - facturador:  emite comprobantes y consulta (dentro de su tenant).
 *  - lector:      solo lectura.
 */
export enum Rol {
  Admin = "admin",
  Facturador = "facturador",
  Lector = "lector",
}

export const ROLES = Object.values(Rol);

/** Permisos atómicos que las rutas pueden exigir. */
export enum Permiso {
  /** Gestionar usuarios del tenant. */
  GestionarUsuarios = "gestionar_usuarios",
  /** Registrar emisores y subir certificados. */
  GestionarEmisores = "gestionar_emisores",
  /** Gestionar API keys / integraciones de aplicaciones externas. */
  GestionarIntegraciones = "gestionar_integraciones",
  /** Emitir comprobantes / iniciar sesión de Hacienda. */
  Emitir = "emitir",
  /** Consultar comprobantes y datos. */
  Leer = "leer",
}

const PERMISOS_POR_ROL: Record<Rol, Permiso[]> = {
  [Rol.Admin]: [
    Permiso.GestionarUsuarios,
    Permiso.GestionarEmisores,
    Permiso.GestionarIntegraciones,
    Permiso.Emitir,
    Permiso.Leer,
  ],
  [Rol.Facturador]: [Permiso.Emitir, Permiso.Leer],
  [Rol.Lector]: [Permiso.Leer],
};

/** Indica si un rol tiene un permiso dado. */
export function rolTienePermiso(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS_POR_ROL[rol]?.includes(permiso) ?? false;
}
