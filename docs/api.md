# Referencia de la API

Documentación **interactiva**:

- 📖 **Scalar (moderna):** `http://localhost:3001/docs`
- 🧪 **Swagger UI (clásica):** `http://localhost:3001/swagger`
- `{}` **Especificación OpenAPI:** `http://localhost:3001/swagger/json`
- 🏠 **Página de inicio:** `http://localhost:3001/`

## Control de acceso

La API es **multi-tenant**: cada organización (tenant) tiene sus usuarios, emisores y
comprobantes, aislados de los demás. Casi todos los endpoints requieren un **JWT** en la
cabecera `Authorization: Bearer <token>`, que se obtiene en `/auth/registro` o `/auth/login`.

**Roles y permisos:**

| Rol | Gestionar usuarios | Gestionar emisores | Emitir | Leer |
|---|:---:|:---:|:---:|:---:|
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `facturador` | | | ✅ | ✅ |
| `lector` | | | | ✅ |

## Endpoints

### 🔓 Públicos
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Página de inicio. |
| `GET` | `/health` | Estado del servicio. |
| `POST` | `/auth/registro` | Crea una organización + usuario admin → devuelve JWT. |
| `POST` | `/auth/login` | Login → devuelve JWT. |

### 🔐 Autenticación (requiere JWT)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/auth/yo` | cualquiera | Perfil del usuario actual. |
| `POST` | `/auth/usuarios` | admin | Crea un usuario en tu organización. |
| `GET` | `/auth/usuarios` | admin | Lista los usuarios de tu organización. |

### 🏢 Emisores (requiere JWT)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/emisor` | lector+ | Lista los emisores del tenant. |
| `POST` | `/emisor` | admin | Registra / actualiza un emisor. |
| `POST` | `/emisor/:cedula/certificado` | admin | Sube el `.p12` (cifrado). |

### 🎫 Sesión con Hacienda (requiere JWT)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/hacienda/login` | facturador+ | Login en el IDP de Hacienda para un emisor. |
| `POST` | `/hacienda/token` | facturador+ | Access token válido (renueva). |
| `POST` | `/hacienda/logout` | facturador+ | Cierra la sesión de Hacienda. |

### 📄 Comprobantes (requiere JWT)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/comprobante/:tipo/enviar` | facturador+ | Emite de punta a punta. |
| `GET` | `/comprobante/:clave` | lector+ | Consulta un comprobante. |
| `POST` | `/factura/xml` | — | Genera el XML (sin firmar). |
| `POST` | `/mensaje-receptor/xml` | — | XML de Mensaje Receptor. |

## Códigos de respuesta

| Código | Significado |
|---|---|
| `200` / `201` | OK / creado. |
| `400` | Entrada inválida o comprobante que no pasa la validación de negocio. |
| `401` | No autenticado (JWT ausente o inválido) o sesión de Hacienda vencida. |
| `403` | Tu rol no tiene permiso, o el recurso es de otra organización. |
| `404` | Recurso no encontrado. |
| `409` | Conflicto (correo o emisor ya existente). |
| `502` | Fallo al comunicarse con Hacienda. |

Para el flujo completo con ejemplos, ver [Conexión con Hacienda](./conexion-hacienda.md).
