# Payment Service

Microservicio de **pagos**: bloqueo temporal en el checkout (HU2), procesamiento de pagos ficticios (HU3),
validaciones, reembolsos e integración con una pasarela simulada. Base de datos `payment-db` con las colecciones
`intenciones_pago`, `pagos` y `reembolsos`. Nunca almacena el número completo de la tarjeta ni el CVV.

## Endpoints (`/api/v1`, todos con JWT)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/checkout/holds` `{flightId, seatNumber}` | **HU2 (endpoint 2)**: bloquea el asiento vía el módulo de Reservas (5-10 min, emite `SeatLocked`) y crea la intención de pago |
| DELETE | `/checkout/holds/:reservationId` | Libera el bloqueo |
| GET | `/payment-intents/:id` | Intención de pago |
| POST | `/payments` `{paymentIntentId, passenger, card}` | **HU3**: procesa el pago → `PaymentProcessed` (201 aprobado / 402 rechazado) |
| GET | `/payments/me` · `/payments/:id` | Pagos (incluye `reservationCode` y reembolsos) |
| POST | `/payments/:id/refunds` `{reason}` | Reembolso → `PaymentRefunded` |

Reglas de la pasarela simulada: una tarjeta que termina en `0002` se rechaza por fondos insuficientes, una que termina
en `0069` se rechaza como reportada, y cualquier otra tarjeta válida por Luhn se aprueba.

Consume `SeatReleased` (expira la intención), `ReservationFailed` (reembolso automático), `ReservationConfirmed`
(asocia el código de reserva) y `FlightStatusChanged` (con `CANCELLED` reembolsa todos los pagos del vuelo).

## Ejecutar

```bash
docker compose up -d --build                                   # servicio + Kafka + MongoDB
# o local: npm run build:deps && npm install && cp .env.example .env && npm run dev
npm test
```
