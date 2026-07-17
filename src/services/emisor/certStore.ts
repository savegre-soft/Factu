/**
 * Almacén de certificados de los emisores.
 *
 * Guarda el .p12 y su clave CIFRADOS (AES-256-GCM) en el repositorio de emisores,
 * y los recupera descifrándolos para producir un `Certificado` listo para firmar.
 */
import { cargarP12, type Certificado } from "../firma/certificado.js";
import { sellar, abrir, abrirTexto } from "../../infra/crypto/secretBox.js";
import type { EmisorRepository } from "../../infra/repos/types.js";

export class CertStore {
  constructor(
    private readonly emisores: EmisorRepository,
    private readonly masterKey: string,
  ) {}

  /**
   * Valida y guarda el .p12 de un emisor, cifrado en reposo.
   * Verifica primero que el .p12 y la clave sean correctos (cargándolo).
   */
  async guardar(cedula: string, p12: Buffer, password: string): Promise<void> {
    // Falla temprano si el .p12 o la clave son inválidos.
    cargarP12(p12, password);

    await this.emisores.guardarCertificado(cedula, {
      p12: sellar(p12, this.masterKey),
      password: sellar(password, this.masterKey),
    });
  }

  /** Indica si un emisor ya tiene certificado cargado. */
  async tieneCertificado(cedula: string): Promise<boolean> {
    const emisor = await this.emisores.buscar(cedula);
    return Boolean(emisor?.certificado);
  }

  /** Recupera y descifra el certificado de un emisor, listo para firmar. */
  async obtenerCertificado(cedula: string): Promise<Certificado> {
    const emisor = await this.emisores.buscar(cedula);
    if (!emisor?.certificado) {
      throw new Error(`El emisor "${cedula}" no tiene un certificado cargado`);
    }
    const p12 = abrir(emisor.certificado.p12, this.masterKey);
    const password = abrirTexto(emisor.certificado.password, this.masterKey);
    return cargarP12(p12, password);
  }
}
