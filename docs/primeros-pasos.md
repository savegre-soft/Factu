# Primeros pasos

## Requisitos

- Node.js ≥ 20
- (Opcional) PostgreSQL, solo si usas persistencia `prisma`
- (Opcional) Docker + Docker Compose, para levantar todo con un comando

## Opción A — Local (persistencia en memoria)

Es la forma más rápida de probar; no necesita base de datos.

```bash
npm install
cp .env.example .env      # completa FACTU_MASTER_KEY y los endpoints de Hacienda
npm run dev               # http://localhost:3000  ·  docs en /docs
```

## Opción B — Docker Compose (con PostgreSQL)

Levanta la API y una base PostgreSQL:

```bash
docker compose up --build
```

- API: `http://localhost:3000`
- Documentación interactiva: `http://localhost:3000/docs`
- La base se inicializa sola (`prisma db push`) al arrancar.

## Verificar que funciona

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"factu"}
```

En el navegador:

- `http://localhost:3000/` — página de inicio
- `http://localhost:3000/docs` — documentación interactiva (Scalar)
- `http://localhost:3000/swagger` — Swagger UI clásico

> Casi todos los endpoints requieren autenticación: crea tu organización con
> `POST /auth/registro`, copia el `token` y úsalo como `Authorization: Bearer <token>`.
> En Scalar/Swagger, pégalo en el botón **Authorize**.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor en modo desarrollo (recarga en caliente). |
| `npm test` | Ejecuta la suite de tests (Vitest). |
| `npm run typecheck` | Chequeo de tipos sin emitir. |
| `npm run build` | Compila a `dist/`. |
| `npm start` | Ejecuta la versión compilada. |
| `npm run prisma:generate` | Genera el cliente Prisma. |
| `npm run prisma:migrate` | Aplica migraciones (requiere PostgreSQL). |

## Siguiente paso

Sigue la [guía de conexión con Hacienda](./conexion-hacienda.md) para emitir tu primer
comprobante.
