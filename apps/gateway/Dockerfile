# Etapa 1: Build (donde compilamos TypeScript)
FROM node:20-slim AS builder

WORKDIR /app

# Instalar TODAS las dependencias (incluyendo devDependencies)
COPY package*.json ./
RUN npm ci

# Copiar código y compilar
COPY . .
RUN npm run build

# Etapa 2: Producción (solo lo necesario)
FROM node:20-slim

WORKDIR /app

# Instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --only=production

# Copiar el código compilado desde la etapa builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]