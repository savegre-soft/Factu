/**
 * Interpretación de los errores del IDP de Hacienda.
 *
 * Distinguir «las credenciales están mal» de «Hacienda falló» decide si la API
 * responde 401 o 502, y con eso si el usuario ve «revisá tu usuario y clave» o
 * se pone a buscar una caída que no existe.
 */

/**
 * ¿El rechazo del IDP es por credenciales equivocadas?
 *
 * Keycloak contesta `401` cuando el cliente no está autorizado y `400` con
 * `{"error":"invalid_grant"}` cuando el usuario o la contraseña no son válidos.
 * Ese 400 es el caso común y el que antes se confundía con un fallo de red.
 */
export function esCredencialInvalida(status: number, cuerpo: unknown): boolean {
  if (status === 401) return true;
  if (status !== 400) return false;

  if (typeof cuerpo === "string") return cuerpo.includes("invalid_grant");
  if (cuerpo && typeof cuerpo === "object") {
    const error = (cuerpo as { error?: unknown }).error;
    return error === "invalid_grant" || error === "invalid_client";
  }
  return false;
}
