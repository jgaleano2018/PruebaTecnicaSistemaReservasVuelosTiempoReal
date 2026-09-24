# API

Todas las respuestas usan el mismo formato:

```json
{ "success": true, "data": {}, "meta": {} }
{ "success": false, "error": { "code": "SEAT_NOT_AVAILABLE", "message": "...", "details": {} } }
```

Autenticación: `Authorization: Bearer <JWT>` obtenido en `POST http://localhost:3000/api/v1/auth/login`. El mismo token sirve en todos los servicios.

Códigos de error frecuentes: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 SEAT_NOT_AVAILABLE | FLIGHT_NOT_BOOKABLE |
MAX_HOLDS_REACHED | HOLD_EXPIRED | ALREADY_PAID | PAYMENT_IN_PROGRESS | INVALID_STATUS_TRANSITION`, `402` (pago rechazado), `422 VALIDATION_ERROR`.

## Monolito modular: http://localhost:3000/api/v1

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

## Flight Management Service: http://localhost:3001/api/v1

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

## Payment Service: http://localhost:3002/api/v1

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/checkout/holds` `{flightId, seatNumber}` | **HU2 (endpoint 2)**: bloquea el asiento vía el módulo de Reservas (5-10 min, emite `SeatLocked`) y crea la intención de pago |
| DELETE | `/checkout/holds/:reservationId` | Libera el bloqueo |
| GET | `/payment-intents/:id` | Intención de pago |
| POST | `/payments` `{paymentIntentId, passenger, card}` | **HU3**: procesa el pago → `PaymentProcessed` (201 aprobado / 402 rechazado) |
| GET | `/payments/me` · `/payments/:id` | Pagos (incluye `reservationCode` y reembolsos) |
| POST | `/payments/:id/refunds` `{reason}` | Reembolso → `PaymentRefunded` |

## Realtime Gateway: ws://localhost:4000

### Protocolo Socket.io (`ws://localhost:4000`)

Autenticación opcional: `io(url, { auth: { token: '<JWT>' } })`. Con token, el socket se une a `user:{id}`.

| Cliente → Gateway | Sala |
|---|---|
| `subscribe:flights` | `flights:list` (resultados de búsqueda, HU1) |
| `subscribe:flight`, flightId | `flight:{id}` (mapa de asientos, HU2/HU3) |
| `subscribe:dashboard`, flightId \| `'all'` | `dashboard:{id}` / `dashboard:all` (HU4) |
| `subscribe:reservation`, reservationId | `reservation:{id}` (requiere JWT) |

| Gateway → Cliente | Origen |
|---|---|
| `seat:locked` / `seat:released` | SeatLocked / SeatReleased |
| `seat:occupied` (global) + `reservation:confirmed` (comprador) | ReservationConfirmed |
| `reservation:failed` | ReservationFailed |
| `flight:status-changed` | FlightStatusChanged |
| `payment:processed` (sin datos personales) | PaymentProcessed |
| `dashboard:occupancy` | FlightOccupancyUpdated |

```ts
import { io } from 'socket.io-client';
const socket = io('http://localhost:4000', { auth: { token } });
socket.emit('subscribe:flight', flightId, (ack) => console.log(ack));
socket.on('seat:locked', (e) => markSeat(e.seatNumber, 'LOCKED'));
```

### SSE y utilidades (`/api/v1`)

`/sse/flights` · `/sse/flights/:flightId` · `/sse/dashboard/:flightId|all` · `/gateway/stats` · `/gateway/protocol`

## Ejemplo del flujo principal

Ver [`backend/requests.http`](../../backend/requests.http).
