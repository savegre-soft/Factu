# --- Etapa de build ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# openssl: Prisma lo necesita para detectar el target correcto al generar el engine
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Dependencias (capa cacheable)
COPY package*.json ./
RUN npm ci

# Cliente Prisma (necesita el esquema)
COPY prisma ./prisma
RUN npx prisma generate

# Código y compilación TypeScript -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Etapa de ejecución ---
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Prisma requiere openssl en tiempo de ejecución
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copiamos node_modules (con el cliente Prisma ya generado), dist y prisma
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/main.js"]
