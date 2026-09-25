# Monolito modular: Sistema de Reservas de Vuelos

Express + TypeScript + MongoDB (Mongoose) + Kafka + RxJS, con arquitectura hexagonal por módulo.

```
src/
├─ modules/
│  ├─ flight/       Módulo de Vuelos: búsqueda y filtros, estados, rutas, aeropuertos, aviones
│  ├─ reservation/  Módulo de Reservas: mapa de asientos, bloqueo temporal, confirmación y ticket
│  ├─ customer/     Módulo de Clientes: pasajeros, perfiles, historial y contacto
│  ├─ realtime/     Módulo de Tiempo Real: suscripción a eventos, notificaciones en vivo (SSE)
│  ├─ analytics/    Módulo de Dashboard: métricas, ocupación, demanda y reportes
│  └─ auth/         Autenticación y autorización (JWT)
│     └─ (cada módulo: domain/ · application/ · infrastructure/{http,persistence,messaging})
├─ shared/          Capa de infraestructura y comunicación: JWT, errores, validación, logs, Kafka, SSE
├─ database/seed/   Creación de colecciones y carga inicial
├─ container.ts     Composition root (puertos ↔ adaptadores)
└─ main.ts
```

## Base de datos `reservas_vuelos_db`

Colecciones: `vuelos`, `aeropuertos`, `rutas`, `aviones`, `reservas`, `clientes`, `asientos` y `usuarios`.
Al arrancar con `SEED_ON_START=true` y la base vacía, se crean las colecciones con sus índices y se cargan 10
aeropuertos, 20 rutas, 5 aviones, 320 vuelos (10 días desde hoy), ≈49.000 asientos, reservas confirmadas
históricas (ocupación del 10 al 45 %), 5 clientes y 4 usuarios. Algunos vuelos quedan retrasados o cancelados para la demo.

```bash
npm run seed              # carga si está vacía
npm run seed -- --reset   # borra y vuelve a cargar
```

## Endpoints (`/api/v1`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/register` · `/auth/login` | — | Registro e inicio de sesión (JWT) |
| GET | `/auth/me` | JWT | Usuario actual |
| GET | `/flights/search?origin&destination&date[&cabinClass&maxPrice]` | — | **HU1**: vuelos con tarifas, horarios, estado y disponibilidad |
| GET | `/flights/:flightId` | — | Detalle del vuelo |
| GET | `/airports` · `/routes` · `/aircraft` | — | Catálogos |
| GET | `/flights/:flightId/seats` | opcional | **HU2**: mapa interactivo completo |
| GET | `/flights/:flightId/seats/:seatNumber` | opcional | **HU2 (endpoint 1)**: información de un asiento (`lockedByMe`) |
| POST | `/reservations/holds` | CUSTOMER/ADMIN | Bloqueo temporal (lo invoca el Payment Service) → `SeatLocked` |
| DELETE | `/reservations/holds/:reservationId` | dueño | Libera el bloqueo → `SeatReleased` |
| GET | `/reservations/me` · `/reservations/:id` | JWT | Reservas |
| GET | `/reservations/:id/ticket` · `/tickets/:reservationCode` | JWT | **HU3**: boleto con código único |
| GET | `/customers/me` · `/customers/:id` · `/customers/:id/reservations` | JWT | Clientes e historial |
| GET | `/customers` | ADMIN | Listado de clientes |
| PATCH | `/customers/:id/contact` | dueño | Datos de contacto |
| GET | `/analytics/flights/:id/metrics` | — | Métricas de ocupación, conversión e ingresos |
| GET | `/analytics/demand` · `/analytics/reports/summary` | ADMIN | Demanda por ruta y reporte general |
| GET | `/realtime/events?flightId&types` | — | SSE de eventos de dominio (respaldo del gateway) |
| GET | `/realtime/status` | — | Suscripciones y estadísticas del bus |
| GET | `/internal/flights` · `/internal/flights/:id/seats` | `x-internal-api-key` | Sincronización del FMS |

Eventos: publica `SeatLocked`, `SeatReleased`, `ReservationConfirmed` y `ReservationFailed`; consume
`PaymentProcessed`, `PaymentRefunded` y `FlightStatusChanged`.

## Ejecutar

```bash
docker compose up -d --build                          # monolito + Mongo + Kafka
# o en local (con la infraestructura arriba):
npm run build:shared && npm install && cp .env.example .env && npm run dev
npm test                                              # pruebas e2e con adaptadores en memoria
```
