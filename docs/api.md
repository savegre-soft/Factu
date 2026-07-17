# Referencia de la API

La documentación **interactiva y siempre actualizada** (OpenAPI/Swagger) está en:

```
http://localhost:3000/docs
```

Ahí puedes ver los esquemas de cada endpoint y probarlos con "Try it out".
La especificación OpenAPI en JSON está en `http://localhost:3000/docs/json`.

## Endpoints

### Utilidades
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Estado del servicio. |
| `POST` | `/clave` | Genera la clave numérica de 50 dígitos. |

### Auth
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/login` | Inicia sesión en el IDP y cachea los tokens del emisor. |
| `POST` | `/auth/token` | Devuelve un access token válido (renueva si hace falta). |
| `POST` | `/auth/logout` | Cierra sesión y descarta los tokens. |

### Emisores
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/emisor` | Registra o actualiza un emisor. |
| `POST` | `/emisor/:cedula/certificado` | Sube el `.p12` (cifrado en reposo). |

### Comprobantes
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/factura/xml` | Genera el XML (sin firmar) de una factura. |
| `POST` | `/comprobante/:tipo/enviar` | Emite de punta a punta (`factura`, `tiquete`, `nota-credito`, `nota-debito`). |
| `GET` | `/comprobante/:clave` | Consulta un comprobante persistido. |
| `POST` | `/mensaje-receptor/xml` | Genera el XML de un Mensaje Receptor. |

### Firma
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/firma/demo` | DEMO: firma un XML con un certificado autofirmado de prueba. |

## Códigos de respuesta

| Código | Significado |
|---|---|
| `200` | OK. |
| `400` | Entrada inválida (zod) o comprobante que no pasa la validación de negocio (lista de `errores`). |
| `404` | Recurso no encontrado (emisor/comprobante/tipo). |
| `401` | Sesión inválida o expirada con Hacienda. |
| `502` | Fallo al comunicarse con Hacienda. |

Para el flujo completo con ejemplos, ver [Conexión con Hacienda](./conexion-hacienda.md).
