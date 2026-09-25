# Contexto de build: raíz del repositorio (necesita cliente/shared con los DTOs, eventos y validaciones)
#   docker build -f frontend/Dockerfile -t reservas-vuelos/frontend .
FROM node:22-alpine AS build
WORKDIR /app
COPY cliente/shared ./cliente/shared
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend

# Las variables VITE_* se resuelven en tiempo de build: son URLs que abre el NAVEGADOR (host), no la red de Docker
ARG VITE_MONOLITH_URL=http://localhost:3000/api/v1
ARG VITE_FMS_URL=http://localhost:3001/api/v1
ARG VITE_PAYMENT_URL=http://localhost:3002/api/v1
ARG VITE_REALTIME_URL=http://localhost:4000
ARG VITE_REALTIME_TRANSPORT=websocket
ENV VITE_MONOLITH_URL=$VITE_MONOLITH_URL \
    VITE_FMS_URL=$VITE_FMS_URL \
    VITE_PAYMENT_URL=$VITE_PAYMENT_URL \
    VITE_REALTIME_URL=$VITE_REALTIME_URL \
    VITE_REALTIME_TRANSPORT=$VITE_REALTIME_TRANSPORT
RUN cd frontend && npm test && npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
