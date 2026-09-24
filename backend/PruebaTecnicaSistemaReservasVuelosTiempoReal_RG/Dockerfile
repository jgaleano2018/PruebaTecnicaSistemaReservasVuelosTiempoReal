# Contexto de build: raíz del repositorio (necesita cliente/shared)
FROM node:22-alpine AS build
WORKDIR /app
COPY cliente/shared ./cliente/shared
RUN cd cliente/shared && npm ci && npm run build
COPY backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/package*.json ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/
WORKDIR /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG
RUN npm ci
COPY backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/ ./
RUN npm run build && npm prune --omit=dev && cd /app/cliente/shared && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/cliente/shared ./cliente/shared
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/dist ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/dist
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/node_modules ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/node_modules
COPY --from=build /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/package.json ./backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/
WORKDIR /app/backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/main.js"]
