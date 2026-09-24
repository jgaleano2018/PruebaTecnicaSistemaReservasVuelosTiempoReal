# Flight Management Service

Microservicio de **gestión avanzada de vuelos** y del **Dashboard en tiempo real (HU4)**. Base de datos `flight-db`
con las colecciones `vuelos_gestion`, `ocupacion_vuelos`, `historial_estados` y `sincronizaciones`.

- Sincroniza el catálogo desde el monolito al arrancar, con reintentos reactivos.
- Gobierna los cambios de estado (retrasos, cancelaciones, embarque, agotado) con transiciones validadas → `FlightStatusChanged`.
- Mantiene una proyección de ocupación por vuelo que se alimenta de `SeatLocked`, `SeatReleased` y `ReservationConfirmed`.
  La proyección guarda el estado de cada asiento, así que procesar un evento repetido no altera el resultado, y cada
  actualización es atómica (update con pipeline de agregación).
- Cada cambio de ocupación se publica como `FlightOccupancyUpdated` (→ Realtime Gateway) y se emite por SSE.
- Detecta vuelos agotados y los marca `SOLD_OUT`; si se liberan asientos, los regresa a `SCHEDULED`.

## Endpoints (`/api/v1`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/dashboard/overview?hoursAhead=72` | — | Métricas agregadas (disponibles, bloqueados, ocupados, % ocupación) |
| GET | `/dashboard/flights?date=YYYY-MM-DD` | — | Ocupación por vuelo |
| GET | `/dashboard/flights/:flightId/occupancy` | — | **HU4**: ocupación en vivo del vuelo |
| GET | `/dashboard/flights/:flightId/stream` | — | **HU4** SSE: snapshot + cada cambio |
| GET | `/dashboard/stream` | — | SSE de todos los vuelos |
| GET | `/flights?date&status&origin&destination` | — | Vuelos gestionados |
| GET | `/flights/:flightId` · `/flights/:flightId/status-history` | — | Detalle e historial de estados |
| PATCH | `/flights/:flightId/status` | ADMIN | Cambio, retraso o cancelación → `FlightStatusChanged` |
| POST | `/flights/sync` | ADMIN | Re-sincroniza el catálogo |
| POST | `/airlines/sync` | ADMIN | Sincronización con aerolíneas/GDS (feed opcional; vacío = simulación) |
| GET | `/sync/log` | ADMIN | Bitácora de sincronizaciones |

## Ejecutar

```bash
docker compose up -d --build                                   # servicio + Kafka + MongoDB
# o local: npm run build:deps && npm install && cp .env.example .env && npm run dev
npm test
```
