# Contexto de build: raíz del repositorio (necesita cliente/shared)
FROM node:22-alpine AS build
WORKDIR /app
COPY cliente/shared ./cliente/shared
RUN cd cliente/shared && npm ci && npm run build
COPY backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/package*.json ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/
WORKDIR /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS
RUN npm ci
COPY backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/ ./
RUN npm run build && npm prune --omit=dev && cd /app/cliente/shared && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/cliente/shared ./cliente/shared
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/dist ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/dist
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/node_modules ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/node_modules
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/package.json ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/
WORKDIR /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/main.js"]
