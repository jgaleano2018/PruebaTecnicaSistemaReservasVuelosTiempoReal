# Contexto de build: raíz del repositorio (necesita cliente/shared y backend/shared-kernel)
FROM node:22-alpine AS build
WORKDIR /app
# 1. Paquetes compartidos: DTOs/eventos (cliente/shared) y núcleo técnico (backend/shared-kernel)
COPY cliente/shared ./cliente/shared
RUN cd cliente/shared && npm ci && npm run build
COPY backend/shared-kernel ./backend/shared-kernel
RUN cd backend/shared-kernel && npm ci && npm run build
# 2. Servicio (install-links=true copia los paquetes locales dentro de node_modules)
COPY backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/package*.json backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/.npmrc ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/
WORKDIR /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS
RUN npm ci
COPY backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/package.json ./
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/node_modules ./node_modules
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/dist ./dist
USER node
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "dist/main.js"]
