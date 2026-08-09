/**
 * Persistencia de las sesiones con el IDP de Hacienda.
 *
 * El `TokenStore` mantiene los tokens en memoria para no ir a la base en cada
 * emisión; este almacén es el respaldo detrás de ese caché. Los tokens son
 * credenciales, así que se guardan cifrados con la llave maestra (AES-256-GCM),
 * igual que los certificados .p12.
 */
import { sellar, abrirTexto } from "../../infra/crypto/secretBox.js";
import type { SesionHaciendaRepository } from "../../infra/repos/types.js";
import type { TokenSet } from "./haciendaAuth.js";

/** Lo que el TokenStore necesita de su respaldo. */
export interface AlmacenSesiones {
  guardar(clave: string, tokens: TokenSet): Promise<void>;
  leer(clave: string): Promise<TokenSet | null>;
  borrar(clave: string): Promise<void>;
}

export class AlmacenSesionesCifrado implements AlmacenSesiones {
  constructor(
    private readonly repo: SesionHaciendaRepository,
    private readonly masterKey: string,
  ) {}

  async guardar(clave: string, tokens: TokenSet): Promise<void> {
    await this.repo.guardar({
      cedulaEmisor: clave,
      tokensSellado: sellar(JSON.stringify(tokens), this.masterKey),
      refreshExpiresAt: new Date(tokens.refreshExpiresAt),
    });
  }

  async leer(clave: string): Promise<TokenSet | null> {
    const fila = await this.repo.buscar(clave);
    if (!fila) return null;
    // Un refresh vencido ya no sirve para nada: se descarta la fila.
    if (fila.refreshExpiresAt.getTime() <= Date.now()) {
      await this.repo.eliminar(clave);
      return null;
    }
    try {
      return JSON.parse(abrirTexto(fila.tokensSellado, this.masterKey)) as TokenSet;
    } catch {
      // Llave maestra rotada sin recifrar, o dato corrupto: se descarta y el
      // emisor vuelve a iniciar sesión, que es preferible a romper la emisión.
      await this.repo.eliminar(clave);
      return null;
    }
  }

  async borrar(clave: string): Promise<void> {
    await this.repo.eliminar(clave);
  }
}
