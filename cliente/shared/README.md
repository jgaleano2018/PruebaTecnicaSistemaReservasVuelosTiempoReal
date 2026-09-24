# @reservas-vuelos/shared

Paquete compartido entre el frontend (React / React Native) y los backends (Node.js + Express + TypeScript).

| Carpeta | Contenido |
|---|---|
| `src/enums.ts` | `FlightStatus`, `SeatStatus`, `ReservationStatus`, `PaymentStatus`, `UserRole`, ... |
| `src/dtos` | DTOs de las APIs REST (búsqueda, mapa de asientos, bloqueo, pago, boleto, dashboard, auth) |
| `src/events` | Catálogo de eventos de dominio, tópicos de Kafka y sobre `DomainEvent` |
| `src/realtime` | Nombres de eventos Socket.io, salas y tipos `ServerToClientEvents` / `ClientToServerEvents` |
| `src/validation` | Esquemas Zod (búsqueda, bloqueo, pasajero, tarjeta con Luhn, cambio de estado) y reglas de negocio |

```bash
npm install && npm run build    # genera dist/ (CommonJS + .d.ts)
```

Uso desde un proyecto: `"@reservas-vuelos/shared": "file:../../cliente/shared"`.

```ts
import { flightSearchQuerySchema, ServerSocketEvents, FlightDto } from '@reservas-vuelos/shared';
```
