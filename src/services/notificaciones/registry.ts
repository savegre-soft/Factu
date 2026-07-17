/** Registro de proveedores: extensible sin tocar la lógica de negocio. */
import type { ChannelType, NotificationProvider, ProviderKey } from "./tipos.js";

export class ProviderRegistry {
  private readonly porClave = new Map<ProviderKey, NotificationProvider>();

  registrar(provider: NotificationProvider): void {
    this.porClave.set(provider.clave, provider);
  }

  resolver(clave: ProviderKey): NotificationProvider {
    const p = this.porClave.get(clave);
    if (!p) throw new Error(`Proveedor de notificación desconocido: "${clave}"`);
    return p;
  }

  tiene(clave: string): clave is ProviderKey {
    return this.porClave.has(clave as ProviderKey);
  }

  todos(): NotificationProvider[] {
    return [...this.porClave.values()];
  }

  porCanal(canal: ChannelType): NotificationProvider[] {
    return this.todos().filter((p) => p.canal === canal);
  }
}
