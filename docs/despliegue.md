# Despliegue

## Docker Compose (recomendado para la laptop)

Levanta la API + PostgreSQL con un comando:

```bash
docker compose up --build
```

- API: `http://localhost:3000`
- Documentación: `http://localhost:3000/docs`
- Base PostgreSQL en el puerto `5432` (datos persistidos en el volumen `pgdata`).

El servicio `app` ejecuta `prisma db push` al arrancar para crear/actualizar las
tablas, y luego inicia el servidor.

Para detener y limpiar:

```bash
docker compose down          # detiene
docker compose down -v       # detiene y borra el volumen de datos
```

> Antes de un entorno real, cambia `FACTU_MASTER_KEY` en `docker-compose.yml` (o
> pásala por un gestor de secretos) y ajusta las URLs de Hacienda.

## Solo la imagen (sin base de datos)

Modo persistencia en memoria, útil para una prueba rápida:

```bash
docker build -t factu .
docker run -p 3000:3000 -e FACTU_MASTER_KEY=una-llave -e PERSISTENCIA=memoria factu
```

## Sin Docker

```bash
npm ci
npm run build
# Con Prisma:
PERSISTENCIA=prisma DATABASE_URL=postgresql://... npx prisma migrate deploy
npm start
```

## Variables en producción

- `NODE_ENV=production`
- `FACTU_MASTER_KEY` **obligatoria** (si falta, el arranque falla).
- `PERSISTENCIA=prisma` + `DATABASE_URL` para una base real.
- `HACIENDA_ENV=prod` y las URLs/`client_id` de producción.
- `HACIENDA_POLICY_URL` + `HACIENDA_POLICY_HASH` para firma XAdES-EPES.

Ver [configuración](./configuracion.md) para la lista completa.

## Integración continua

El workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) corre en cada
push y pull request: instala dependencias, genera el cliente Prisma, hace typecheck,
ejecuta los tests y compila.
