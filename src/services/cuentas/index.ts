/** Composición del módulo de cuentas: OAuth + reseteo de contraseña. */
import { env } from "../../config/env.js";
import {
  tenantRepository,
  usuarioRepository,
  oauthIdentityRepository,
  passwordResetRepository,
} from "../../infra/repos/index.js";
import { CuentaService } from "./cuentaService.js";
import { PasswordResetService } from "./passwordResetService.js";
import { NodemailerPlataforma } from "./mailerPlataforma.js";
import { GoogleProvider, MicrosoftProvider, type ProveedorOAuth, type ProviderKey } from "./oauthProviders.js";
import { registrarLog } from "../logs/index.js";

export const cuentaService = new CuentaService(
  tenantRepository,
  usuarioRepository,
  oauthIdentityRepository,
);

export const passwordResetService = new PasswordResetService(
  usuarioRepository,
  passwordResetRepository,
  new NodemailerPlataforma(),
  env.PASSWORD_RESET_TTL_MINUTOS,
  (nivel, mensaje) => registrarLog({ nivel, origen: "auth", mensaje }),
);

const PROVEEDORES: Record<ProviderKey, ProveedorOAuth> = {
  google: new GoogleProvider(),
  microsoft: new MicrosoftProvider(),
};

export function proveedorOAuth(clave: string): ProveedorOAuth | null {
  return clave === "google" || clave === "microsoft" ? PROVEEDORES[clave] : null;
}

/** Proveedores efectivamente configurados (para mostrar botones en la UI). */
export function proveedoresConfigurados(): Record<ProviderKey, boolean> {
  return { google: PROVEEDORES.google.configurado(), microsoft: PROVEEDORES.microsoft.configurado() };
}

export * from "./oauthProviders.js";
export * from "./estado.js";
