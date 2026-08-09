# Referencia de la API

Documentación **interactiva**:

- 📖 **Scalar (moderna):** `http://localhost:3000/docs`
- 🧪 **Swagger UI (clásica):** `http://localhost:3000/swagger`
- `{}` **Especificación OpenAPI:** `http://localhost:3000/swagger/json`
- 🏠 **Página de inicio:** `http://localhost:3000/`

> En producción `/docs` y `/swagger` están **apagadas** (exponen el mapa completo de la
> API sin autenticación). Para publicarlas a propósito: `DOCS_PUBLICAS=true`.

## Control de acceso

La API es **multi-tenant**: cada organización (tenant) tiene sus usuarios, emisores y
comprobantes, aislados de los demás. Casi todos los endpoints requieren autenticación.

Hay tres formas de presentarse:

| Actor | Cómo |
|---|---|
| Usuario (cliente no-navegador) | `Authorization: Bearer <JWT>`, obtenido en `/auth/registro` o `/auth/login`. |
| Usuario (navegador) | Cookie `factu_sesion` (`httpOnly`), que el login deja puesta. |
| Integración externa | `Authorization: Bearer factu_…` (API key creada en `/api-keys`). |

Con la cookie, los métodos que cambian estado (`POST`/`PUT`/`PATCH`/`DELETE`) exigen que
el `Origin` sea el propio host o `APP_URL`; si no, `403`.

**Roles y permisos:**

| Rol | Gestionar usuarios | Gestionar emisores | Integraciones | Notificaciones | Emitir | Leer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `facturador` | | | | | ✅ | ✅ |
| `lector` | | | | | | ✅ |

## Límite de peticiones

300 peticiones por minuto en general, y **10 por minuto** en `/auth/login`,
`/auth/registro`, `/auth/password/olvide`, `/auth/password/reset` y `/hacienda/login`.
La clave es el usuario autenticado cuando lo hay, y la IP cuando no. `/`, `/health` y
`/docs` no consumen cupo. Al pasarse, la API responde `429`.

## Paginación

Los listados aceptan `?limite=` (1–200, 50 por defecto) y `?desplazamiento=`, y devuelven
`{ total, limite, desplazamiento, items }`. Los comprobantes se listan sin `xmlFirmado`
ni `respuestaXml`; para obtenerlos hay que consultar el comprobante por su clave.

## Endpoints

### 🔓 Públicos
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Página de inicio. |
| `GET` | `/health` | Estado del servicio. |
| `GET` | `/ambiente` | Ambiente de Hacienda efectivo (`stag`/`prod`) y si está listo para producción. |
| `POST` | `/auth/registro` | Crea una organización + usuario admin → devuelve JWT. |
| `POST` | `/auth/login` | Login → devuelve JWT. |
| `POST` | `/auth/password/olvide` · `/auth/password/reset` | Recuperación de contraseña por código. |
| `GET` | `/auth/oauth/proveedores` · `/auth/oauth/:provider/url` · `/callback` | Login con Google / Microsoft. |

### 🔐 Cuenta y usuarios (requiere JWT)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` `PATCH` | `/auth/yo` | cualquiera | Perfil del usuario actual. |
| `PUT` | `/auth/yo/password` | cualquiera | Cambia la propia contraseña. |
| `GET` `DELETE` | `/auth/yo/identidades[/:provider]` | cualquiera | Identidades OAuth vinculadas. |
| `POST` | `/auth/logout` | cualquiera | Cierra la sesión (borra la cookie). |
| `GET` `POST` | `/auth/usuarios` | admin | Lista / crea usuarios de tu organización. |
| `GET` `PATCH` `DELETE` | `/auth/usuarios/:id` | admin | Consulta, edita rol o elimina. |
| `PUT` | `/auth/usuarios/:id/password` | admin | Cambia la contraseña de un usuario. |

### 🏢 Emisores y clientes
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/emisor` | lector+ | Lista los emisores del tenant. |
| `POST` | `/emisor` | admin | Registra / actualiza un emisor. |
| `POST` | `/emisor/:cedula/certificado` | admin | Sube el `.p12` (cifrado en reposo). |
| `GET` | `/clientes` · `/clientes/:numero` | lector+ | Receptores guardados, para autocompletar. |

### 🎫 Sesión con Hacienda
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/hacienda/login` | facturador+ | Login en el IDP de Hacienda para un emisor. |
| `POST` | `/hacienda/token` | facturador+ | Access token válido (renueva). |
| `POST` | `/hacienda/logout` | facturador+ | Cierra la sesión de Hacienda. |

### 📄 Comprobantes
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/comprobante/:tipo/enviar` | facturador+ | Emite de punta a punta. `tipo` ∈ `factura`, `tiquete`, `nota-credito`, `nota-debito`, `compra`, `exportacion`. |
| `POST` | `/recibo-pago/enviar` | facturador+ | Emite un Recibo Electrónico de Pago (REP). |
| `GET` | `/comprobante/proximo-consecutivo` | facturador+ | Próximo número de la serie, sin consumirlo. |
| `GET` | `/comprobantes` | lector+ | Listado paginado y filtrable. |
| `GET` | `/comprobante/:clave` | lector+ | Consulta un comprobante (con XML). |
| `POST` | `/comprobante/:clave/reenviar` | facturador+ | Reenvía el comprobante al cliente por correo. |
| `GET` | `/comprobante/:clave/envios` | lector+ | Historial de envíos de ese comprobante. |
| `POST` | `/factura/xml` | — | Genera el XML (sin firmar). |
| `POST` | `/clave` | — | Genera clave y consecutivo. |
| `POST` | `/firma/demo` | — | Firma XAdES con certificado de prueba (utilidad). |

### 📥 Documentos recibidos y Mensaje Receptor
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` `POST` | `/recibidos` | lector+ / facturador+ | Lista o registra un comprobante recibido. |
| `GET` `DELETE` | `/recibidos/:id` | lector+ / facturador+ | Consulta o elimina. |
| `POST` | `/recibidos/:id/mensaje-receptor` | facturador+ | Genera la aceptación / rechazo. |
| `POST` | `/recibidos/:id/mensaje-receptor/enviar` | facturador+ | La envía a Hacienda. |
| `POST` | `/mensaje-receptor/xml` | — | Genera el XML suelto. |

### 📨 Correo
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` `PUT` `DELETE` | `/correo` | admin | Buzón IMAP entrante del tenant. |
| `POST` | `/correo/probar` · `/correo/sincronizar` | admin | Prueba la conexión / fuerza un barrido. |
| `GET` `PUT` `DELETE` | `/correo-salida` | admin | SMTP saliente del tenant. |
| `POST` | `/correo-salida/probar` | admin | Envía un correo de prueba. |

### 📊 Estadísticas
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/estadisticas/resumen` | lector+ | Totales agregados. |
| `GET` | `/estadisticas/montos` | lector+ | Neto por moneda y mes (las NC restan). |
| `GET` | `/estadisticas/emisores[/:cedula]` | lector+ | Desglose por emisor. |
| `GET` | `/estadisticas/serie` | lector+ | Serie temporal para gráficos. |

Todas aceptan rango `?desde=` / `?hasta=`.

### 🔌 Integraciones
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` `POST` | `/api-keys` | admin | Credenciales de servicio (con alcance por emisor). |
| `DELETE` | `/api-keys/:id` | admin | Revoca una API key. |
| `GET` `POST` | `/webhooks` | admin | Endpoints suscritos a eventos. |
| `PUT` `DELETE` | `/webhooks/:id` | admin | Edita o elimina. |
| `POST` | `/webhooks/:id/probar` | admin | Disparo de prueba. |
| `GET` | `/webhooks/:id/entregas` | admin | Historial de entregas y reintentos. |
| `GET` `POST` | `/notification-channels` | admin | Canales (SMS, WhatsApp, Slack, Teams, Bitrix24, HTTP). |
| `PUT` `DELETE` | `/notification-channels/:id` | admin | Edita o elimina. |
| `POST` | `/notification-channels/:id/probar` | admin | Envía una notificación de prueba. |
| `GET` | `/notification-providers` · `/notification-events` | admin | Catálogos disponibles. |
| `GET` | `/notifications` | admin | Historial de mensajes enviados. |

### 🗂️ Auditoría y colaboración
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/auditoria` | admin | Quién hizo qué y cuándo. |
| `GET` | `/logs` | admin | Logs técnicos del sistema. |
| `GET` `POST` | `/borradores` | facturador+ | Borradores del formulario de emisión. |
| `GET` `PUT` `DELETE` | `/borradores/:id` | facturador+ | Consulta, actualiza o elimina. |
| `GET` `POST` | `/chat/*` | cualquiera | Mensajería interna del tenant. |

## Códigos de respuesta

| Código | Significado |
|---|---|
| `200` / `201` | OK / creado. |
| `400` | Entrada inválida o comprobante que no pasa la validación de negocio. |
| `401` | No autenticado (JWT/API key ausente o inválido) o sesión de Hacienda vencida. |
| `403` | Tu rol no tiene permiso, el recurso es de otra organización, o el `Origin` no es propio. |
| `404` | Recurso no encontrado. |
| `409` | Conflicto (correo o emisor ya existente). |
| `429` | Demasiadas peticiones (ver límite arriba). |
| `502` | Fallo al comunicarse con Hacienda. |

> Ojo con la diferencia entre `401` y `502` al emitir: `401` significa que el emisor no
> tiene sesión con el IDP (hay que llamar `/hacienda/login`); `502` es un fallo real de
> comunicación con Hacienda.

Para el flujo completo con ejemplos, ver [Conexión con Hacienda](./conexion-hacienda.md).
