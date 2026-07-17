/**
 * Composición del servicio de emisores: CertStore sobre el repositorio activo.
 */
import { emisorRepository, masterKey } from "../../infra/repos/index.js";
import { CertStore } from "./certStore.js";

export const certStore = new CertStore(emisorRepository, masterKey());

export { CertStore } from "./certStore.js";
