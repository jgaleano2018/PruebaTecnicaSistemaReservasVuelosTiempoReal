# Realtime Gateway

Microservicio de **tiempo real**: consume todos los tópicos de Kafka y distribuye los eventos a los clientes
por **WebSocket (Socket.io)** o **SSE**. Gestiona las conexiones, las suscripciones por sala y un límite de
suscripciones por socket, y escala horizontalmente (cada réplica usa su propio consumer group).

## Protocolo Socket.io (`ws://localhost:4000`)

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

## SSE y utilidades (`/api/v1`)

`/sse/flights` · `/sse/flights/:flightId` · `/sse/dashboard/:flightId|all` · `/gateway/stats` · `/gateway/protocol`

## Ejecutar

```bash
docker compose up -d --build
npm test
```
