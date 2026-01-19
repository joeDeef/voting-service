# ETAPA 1: Construcción
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
RUN npm install

# Copiar el resto del código y compilar
COPY . .
RUN npm run build

# ETAPA 2: Producción
FROM node:20-alpine AS runner

WORKDIR /app

# Copiar solo lo necesario de la etapa anterior
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Exponer el puerto que definiste (ej. 3001)
EXPOSE 3001

CMD ["node", "dist/main"]