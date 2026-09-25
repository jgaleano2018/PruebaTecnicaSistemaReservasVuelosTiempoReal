# Explicación del código fuente por historia de usuario

Este documento recorre, **archivo por archivo**, cómo el frontend (React), el monolito modular y los microservicios
(Node.js) y los paquetes compartidos cumplen las 4 historias de usuario y sus reglas de tiempo real.

## 0. Mapa de proyectos y convenciones

| Alias en este documento | Carpeta | Rol |
|---|---|---|
| **SHARED** | `cliente/shared/src` | Contratos comunes frontend ↔ backend: DTOs, enums, eventos Kafka, salas Socket.io, esquemas Zod, reglas |
| **KERNEL** | `backend/shared-kernel/src` | Infraestructura técnica común de los 4 backends: JWT, errores, validación, Event Bus (Kafka/memoria), SSE, fábrica Express |
| **MONO** | `backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_Backend/src` | Monolito modular (módulos `flight`, `reservation`, `customer`, `realtime`, `analytics`, `auth`) · puerto 3000 |
| **FMS** | `backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/src` | Flight Management Service (gestión de vuelos + dashboard) · puerto 3001 |
| **PS** | `backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/src` | Payment Service (bloqueo en checkout, pagos, reembolsos) · puerto 3002 |
| **RG** | `backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/src` | Realtime Gateway (Socket.io + SSE) · puerto 4000 |
| **WEB** | `frontend/src` | Frontend React 19 (web + dashboard/admin) · puerto 5173 (dev) / 8090 (Docker) |

**Capas (arquitectura hexagonal)**, iguales en backend y frontend:

- **Backend:** `domain/` (entidades, reglas, puertos) → `application/` (casos de uso) → `infrastructure/`
  (adaptadores: `http/`, `persistence/`, `messaging/`, `clients/`) → `*.module.ts` / `container.ts` (ensamblan las piezas).
- **Frontend:** `domain/` (funciones puras) → `application/` (puertos, hooks con React Query, contextos) →
  `infrastructure/` (APIs REST, Socket.io, SSE, storage) → `ui/` (páginas y componentes) → `app/` (contenedor, router).

### 0.1 Piezas transversales que usan todas las historias

| Archivo | Qué aporta |
|---|---|
| `SHARED/dtos/index.ts` | Tipos de request/response: `FlightDto`, `SeatMapDto`, `SeatHoldDto`, `PaymentDto`, `TicketDto`, `FlightOccupancyDto`... |
| `SHARED/events/index.ts` | Catálogo de eventos (`SeatLocked`, `SeatReleased`, `ReservationConfirmed`, `FlightStatusChanged`, `PaymentProcessed`, `FlightOccupancyUpdated`...), tópicos Kafka y sobre `DomainEvent` |
| `SHARED/realtime/index.ts` | Nombres de eventos Socket.io (`seat:locked`, `flight:status-changed`...), salas (`Rooms.flight(id)`, `Rooms.flightsList()`...) y tipos `ServerToClientEvents` |
| `SHARED/validation/index.ts` | Esquemas Zod compartidos: búsqueda, bloqueo, pasajero, tarjeta (Luhn y vencimiento), cambio de estado; `BusinessRules` (bloqueo de 5 a 10 min) |
| `SHARED/rules/index.ts` | Transiciones de estado de vuelo, estados no reservables, zona horaria de negocio (`businessDayRange`) |
| `KERNEL/application/event-bus.port.ts` | Puerto `EventBus` (`publish`, `subscribe`, `events$` reactivo) |
| `KERNEL/infrastructure/messaging/kafka-event-bus.ts` | Adaptador Kafka: productor idempotente, clave de partición `flightId`, consumidor con reintentos RxJS |
| `KERNEL/infrastructure/auth/jwt.ts` | `JwtService`, middlewares `authenticate`, `optionalAuth`, `authorize(roles)`, `internalOnly` |
| `KERNEL/infrastructure/http/http-utils.ts` | `validate(schema)`, `asyncHandler`, `ok()`, `errorHandler` (sobre de error uniforme) |
| `KERNEL/infrastructure/http/create-service-app.ts` | Fábrica Express común: helmet, CORS, JSON, `/health`, `/api/v1`, 404 y errores |
| `WEB/app/container.ts` | Crea los adaptadores (APIs REST, cliente de tiempo real) y los inyecta por contexto (`services-context.tsx`) |
| `WEB/infrastructure/http/http-client.ts` | `fetch` con JWT, timeout de 15 s, desempaquetado de `{success,data}` y conversión a `AppError` |
| `WEB/infrastructure/realtime/socket-realtime.client.ts` | Conexión Socket.io al RG (reconexión 1 a 8 s), `subscribe:*` por sala con conteo de referencias y re-sincronización al reconectar |
| `WEB/infrastructure/realtime/sse-realtime.client.ts` + `event-source.ts` | Transporte alterno por SSE (`VITE_REALTIME_TRANSPORT=sse`) |
| `WEB/infrastructure/realtime/listener-registry.ts` | Registro de suscriptores común a Socket.io y SSE |
| `WEB/application/realtime/use-realtime.ts` | Hook `useRealtimeChannel(canal, handlers)`: suscribe y dessuscribe una sala según el ciclo de vida del componente; `useResyncOnReconnect` invalida la caché al reconectar |
| `WEB/app/providers/AppProviders.tsx` | `QueryClient` de TanStack Query (reintentos solo en red/5xx, `staleTime` por defecto de 15 s) |

**Canal único de tiempo real hacia los navegadores:**
`servicio → EventBus.publish() → Kafka → RG/infrastructure/websocket/socket-server.ts → io.to(salas).emit() → WEB useRealtimeChannel → setQueryData`.
El enrutamiento evento → sala está en una sola función pura: `RG/application/event-router.ts` (`routeEvent`).

---

## HU1 · Búsqueda y filtro de vuelos

> Buscar vuelos por origen, destino y fecha, y ver los disponibles con tarifas y horarios.
> **Tiempo real:** si un vuelo cambia de estado (cancelado, retrasado, agotado), la lista se actualiza sin recargar.

### Flujo

```
[SearchPage] --GET /api/v1/flights/search?origin&destination&date--> [MONO flight module] --> vuelos + asientos (Mongo)
[SearchPage] --subscribe:flights--> [RG]  (sala flights:list)
[FMS] cambio de estado --FlightStatusChanged--> Kafka --> [MONO] actualiza `vuelos`
                                                     \--> [RG] flight:status-changed --> [SearchPage] actualiza la tarjeta
[FMS] ocupación --FlightOccupancyUpdated--> Kafka --> [RG] dashboard:occupancy --> [SearchPage] actualiza "asientos libres"
```

### Frontend (WEB)

| Archivo | Responsabilidad |
|---|---|
| `ui/pages/SearchPage.tsx` | Formulario (origen, destino, fecha, cabina, precio máximo) validado con el esquema Zod compartido; muestra resultados, orden y notificaciones de cambios |
| `ui/components/FlightCard.tsx` | Tarjeta del vuelo: horario, duración, estado, tarifas por cabina, barra de ocupación, "N asientos libres" y el botón que abre el mapa (`/flights/:flightId`). Si el vuelo no es reservable muestra "No disponible para reserva" |
| `application/hooks/flights.hooks.ts` → `useFlightSearch(query)` | 1) `useQuery` a `flights.search()` (caché 30 s). 2) `useRealtimeChannel({kind:'flights'})`: con `flight:status-changed` aplica `applyFlightStatusChange` y con `dashboard:occupancy` aplica `applyOccupancyToFlights` **sobre la caché** (`setQueriesData`), sin volver a pedir datos |
| `application/hooks/flights.hooks.ts` → `useAirports/useRoutes` | Catálogo para los selectores (caché de 1 h) |
| `domain/flights.ts` | Funciones puras: `isBookable`, `lowestFare`, `applyFlightStatusChange`, `applyOccupancyToFlights`, `sortFlights` |
| `domain/labels.ts`, `domain/format.ts` | Etiquetas de estado (Cancelado, Retrasado N min, Agotado) y formato de moneda y hora |
| `infrastructure/api/monolith.api.ts` | `search()` → `GET {VITE_MONOLITH_URL}/flights/search` |

### Monolito (MONO) · módulo `flight`

| Archivo | Responsabilidad |
|---|---|
| `modules/flight/infrastructure/http/flight.routes.ts` | `GET /flights/search` con `validate(flightSearchQuerySchema,'query')`; `GET /flights/:id`; catálogos `/airports`, `/routes`, `/aircraft`; interno `/internal/flights` para el FMS |
| `modules/flight/application/flight.use-cases.ts` | `SearchFlightsUseCase`: convierte la fecha a rango del día en hora Colombia (`businessDayRange`), consulta el repositorio, filtra por cabina y precio, y completa aeropuertos y **disponibilidad** (vía `SeatAvailabilityPort`). `ApplyFlightStatusChangeUseCase`: aplica `FlightStatusChanged` |
| `modules/flight/domain/flight.entity.ts` | Entidad `Flight`, tarifas y regla `isBookable` (no cancelado, agotado ni despegado) |
| `modules/flight/domain/flight.ports.ts` | Puertos `FlightRepository`, `CatalogRepository` y `SeatAvailabilityPort` (este último lo implementa el módulo de reservas) |
| `modules/flight/infrastructure/persistence/flight.schemas.ts` | Colecciones `vuelos` (índice `{originCode, destinationCode, departureTime}`), `aeropuertos`, `rutas`, `aviones` |
| `modules/flight/infrastructure/persistence/mongo-flight.repository.ts` | Consultas Mongo: búsqueda por rango y `updateStatus` |
| `modules/reservation/application/seat-map.use-cases.ts` → `SeatAvailabilityService` | Disponibilidad por vuelo (agregación sobre `asientos` que trata como libre un bloqueo vencido) |
| `modules/flight/infrastructure/messaging/flight-events.consumer.ts` | Suscripción a `FlightStatusChanged` → actualiza `vuelos` (así una nueva búsqueda ya refleja el estado) |
| `modules/flight/flight.module.ts` | Ensambla casos de uso, rutas y consumidor |
| `database/seed/seed-data.ts`, `seed.ts` | Carga inicial: 10 aeropuertos, 20 rutas, 5 aviones y 320 vuelos en 10 días (algunos retrasados o cancelados para la demo) |

### Origen del cambio de estado (FMS)

| Archivo | Responsabilidad |
|---|---|
| `FMS/infrastructure/http/routes.ts` | `PATCH /flights/:flightId/status` (solo ADMIN) y `POST /airlines/sync` (feed de aerolíneas) |
| `FMS/application/flight-management.use-cases.ts` → `ChangeFlightStatusUseCase` | Valida la transición (`assertTransition`), actualiza `vuelos_gestion` de forma condicional, guarda en `historial_estados` y **publica `FlightStatusChanged`** |
| `FMS/application/dashboard.use-cases.ts` → `applySeatEvent` + `soldOutTransition` | Cuando se ocupan todos los asientos marca el vuelo **`SOLD_OUT`** (agotado) automáticamente, y lo devuelve a `SCHEDULED` si se liberan |

### Realtime Gateway (RG)

| Archivo | Responsabilidad |
|---|---|
| `RG/application/event-router.ts` | `FlightStatusChanged` → evento `flight:status-changed` a las salas `flights:list`, `flight:{id}` y `dashboard:*`. `FlightOccupancyUpdated` → `dashboard:occupancy` también a `flights:list` |
| `RG/infrastructure/websocket/socket-server.ts` | Atiende `subscribe:flights` (une el socket a `flights:list`) y emite los despachos |

**Pruebas:** `MONO/../test/monolith.e2e.spec.ts` (HU1 y "FlightStatusChanged actualiza el vuelo"), `integration-tests/full-flow.spec.ts` (la búsqueda recibe `flight:status-changed` al retrasar el vuelo), `WEB/domain/domain.test.ts`.

---

## HU2 · Selección y bloqueo temporal de asientos

> Seleccionar un asiento en el mapa interactivo y reservarlo temporalmente mientras se completan los datos de pago.
> **Tiempo real:** al hacer clic en un asiento disponible se emite un evento que avisa a los demás usuarios que quedó bloqueado (5 a 10 min).

### Flujo

```
[SeatSelectionPage] --GET /flights/:id/seats--> [MONO] (mapa inicial)         --subscribe:flight(id)--> [RG]
clic en asiento --> CheckoutProvider.holdSeat()
   --POST /api/v1/checkout/holds--> [PS] --POST /api/v1/reservations/holds (JWT del cliente)--> [MONO]
        [MONO] CAS atómico AVAILABLE→LOCKED (7 min) + reserva PENDING_PAYMENT --publish SeatLocked--> Kafka
   <-- 201 {hold, paymentIntent} (expiresAt del servidor → cuenta regresiva)
Kafka --SeatLocked--> [RG] seat:locked a flight:{id} y dashboard:{id} --> otros navegadores pintan el asiento "bloqueado"
Vence el tiempo --> [MONO] barrido cada 5 s libera y publica SeatReleased(EXPIRED) --> [RG] seat:released --> todos lo liberan
```

### Frontend (WEB)

| Archivo | Responsabilidad |
|---|---|
| `ui/pages/SeatSelectionPage.tsx` | Página `/flights/:flightId`: encabezado del vuelo, mapa, leyenda, panel del asiento elegido, "Actividad en vivo" y botón "Continuar con el pago". Maneja el 409 (asiento tomado) re-sincronizando el asiento |
| `ui/components/SeatMap.tsx` | Mapa interactivo accesible: filas y pasillos (`buildCabinLayout`), estados con color, ícono y textura (libre, bloqueado rayado, ocupado ×, mío ✓), navegación con flechas |
| `application/hooks/seats.hooks.ts` → `useLiveSeatMap(flightId)` | 1) `useQuery` del mapa (`reservations.seatMap`). 2) `useRealtimeChannel({kind:'flight', flightId})` con `seat:locked`, `seat:released` y `seat:occupied` → `applySeatEvent` sobre la caché + registro de actividad. 3) `refreshSeat()` usa el **endpoint de un asiento** tras un conflicto |
| `application/checkout/checkout-context.tsx` → `CheckoutProvider` | `holdSeat()` llama a `checkout.createHold()` (Payment Service) y guarda el bloqueo activo (`hold` + `paymentIntent`). Escucha `seat:released` de su reserva y `flight:status-changed` (cancelado) para anular el bloqueo. Tiene un temporizador local de respaldo con el `expiresAt` del servidor. `releaseHold()` libera voluntariamente |
| `ui/components/HoldTimer.tsx` + `domain/hold.ts` | Cuenta regresiva (`remainingMs`, `holdUrgency`, `holdProgress`) con anuncio `aria-live` |
| `domain/seat-map.ts` | Funciones puras: `applySeatEvent` (aplica locked/released/occupied y marca `lockedByMe`), `replaceSeat`, `isSelectable`, `summarize`, `buildCabinLayout` |
| `infrastructure/api/monolith.api.ts` | `seatMap()` → `GET /flights/:id/seats`; `seat()` → `GET /flights/:id/seats/:seat` |
| `infrastructure/api/payment.api.ts` | `createHold()` → `POST {VITE_PAYMENT_URL}/checkout/holds`; `releaseHold()` → `DELETE /checkout/holds/:id` |

### Payment Service (PS): el POST de bloqueo

| Archivo | Responsabilidad |
|---|---|
| `PS/infrastructure/http/routes.ts` | `POST /checkout/holds` (CUSTOMER/ADMIN, `validate(createSeatHoldSchema)`) y `DELETE /checkout/holds/:reservationId` |
| `PS/application/payment.use-cases.ts` → `CreateCheckoutHoldUseCase` | Pide el bloqueo al monolito y crea la **intención de pago** (`intenciones_pago`) con el mismo `expiresAt`; es idempotente por reserva |
| `PS/infrastructure/clients/reservation-hold.client.ts` | Cliente HTTP al monolito reenviando el JWT; propaga los errores de negocio (p. ej. 409 `SEAT_NOT_AVAILABLE`) |
| `PS/infrastructure/messaging/consumers.ts` | Con `SeatReleased` marca la intención `EXPIRED`/`CANCELLED` (ya no se puede pagar) |

### Monolito (MONO) · módulo `reservation`

| Archivo | Responsabilidad |
|---|---|
| `modules/reservation/infrastructure/http/reservation.routes.ts` | `GET /flights/:id/seats` (mapa), **`GET /flights/:id/seats/:seatNumber`** (endpoint 1 de HU2), `POST /reservations/holds`, `DELETE /reservations/holds/:id` |
| `modules/reservation/application/seat-map.use-cases.ts` | `GetSeatMapUseCase`, `GetSeatUseCase` (incluye `lockedByMe` y `lockExpiresAt`) |
| `modules/reservation/application/seat-hold.use-cases.ts` → `CreateSeatHoldUseCase` | Valida que el vuelo sea reservable, que el asiento exista y el límite de bloqueos por usuario; devuelve el bloqueo vigente si ya existe (idempotencia); ejecuta el **bloqueo atómico**, crea la reserva `PENDING_PAYMENT` y **publica `SeatLocked`** |
| `modules/reservation/application/seat-hold.use-cases.ts` → `ExpireSeatHoldsUseCase`, `ReleaseSeatHoldUseCase`, `ReleaseHoldsOnFlightCancelledUseCase` | Liberación por **tiempo expirado**, por el usuario o por vuelo cancelado → **`SeatReleased`** con el motivo |
| `modules/reservation/infrastructure/scheduling/hold-expiration.scheduler.ts` | Barrido reactivo `interval(5 s) + exhaustMap` que ejecuta `ExpireSeatHoldsUseCase` (sin solaparse) |
| `modules/reservation/domain/reservation.entities.ts` | Entidades `Seat` y `Reservation`; `effectiveSeatStatus` (un bloqueo vencido cuenta como libre); `generateReservationCode` |
| `modules/reservation/domain/reservation.ports.ts` | Contrato `SeatRepository` (`tryLock`, `releaseLock`, `releaseExpiredLock`, `occupy`...) que **exige operaciones atómicas** |
| `modules/reservation/infrastructure/persistence/mongo-reservation.repositories.ts` | **Anti double booking:** `tryLock` = un solo `findOneAndUpdate` condicionado a `status: AVAILABLE` o a un bloqueo vencido. El índice único `{flightId, seatNumber}` está en `reservation.schemas.ts` |
| `config/env.ts` | `SEAT_LOCK_MINUTES` (7 por defecto, validado entre 5 y 10), `HOLD_EXPIRATION_SWEEP_MS`, `MAX_ACTIVE_HOLDS_PER_USER` |

### Realtime Gateway (RG)

| Archivo | Responsabilidad |
|---|---|
| `RG/application/event-router.ts` | `SeatLocked` → `seat:locked` y `SeatReleased` → `seat:released`, a las salas `flight:{id}`, `dashboard:{id}` y `dashboard:all` |
| `RG/infrastructure/websocket/socket-server.ts` | Autenticación opcional en el *handshake*, `subscribe:flight`, límite de suscripciones por socket, emisión a salas |
| `RG/infrastructure/http/routes.ts` | Alternativa SSE: `GET /api/v1/sse/flights/:id` |

**Pruebas:** `monolith.e2e.spec.ts` (bloqueo + 409; **25 solicitudes concurrentes → 1 éxito**; expiración → `SeatReleased`), `seat-lock-config.spec.ts` (límites de 5 a 10 min), `PS/test/payment.spec.ts`, `RG/test/event-router.spec.ts`, `integration-tests/full-flow.spec.ts` (otro usuario recibe `seat:locked`), `WEB/domain/seat-map.test.ts`.

---

## HU3 · Confirmación y procesamiento de la reserva

> Confirmar la compra con datos ficticios de pago y obtener el boleto con un código de reserva único.
> **Tiempo real:** tras procesar la reserva, el asiento queda **ocupado de forma permanente** y se emite un **evento global** que lo deshabilita para todos.

### Flujo

```
[CheckoutPage] --POST /api/v1/payments {paymentIntentId, passenger, card}--> [PS]
    [PS] valida (Zod: Luhn, vencimiento, CVV) → intención PENDING→PROCESSING (sin doble cobro) → pasarela ficticia
    [PS] guarda pago (sin PAN completo ni CVV) --publish PaymentProcessed--> Kafka      <-- 201 aprobado / 402 rechazado
Kafka --PaymentProcessed--> [MONO] ConfirmReservationUseCase:
    asiento LOCKED→OCCUPIED (CAS) · cliente upsert · reserva CONFIRMED + PNR único --publish ReservationConfirmed--> Kafka
Kafka --ReservationConfirmed--> [RG] seat:occupied (GLOBAL, sala flight:{id}) + reservation:confirmed (comprador)
                            --> [PS] asocia el código al pago        --> [FMS] ocupación +1
[CheckoutPage] recibe reservation:confirmed (o consulta periódica de respaldo) → [TicketPage] boleto
Si el asiento ya no era suyo → ReservationFailed → [PS] reembolso automático (saga)
```

### Frontend (WEB)

| Archivo | Responsabilidad |
|---|---|
| `ui/pages/CheckoutPage.tsx` | Formulario de pasajero y tarjeta (validación Zod compartida + mensajes por campo), resumen del bloqueo con `HoldTimer`, tarjetas de prueba, estados "procesando / esperando confirmación / rechazado". Navega al boleto al confirmarse |
| `application/hooks/reservations.hooks.ts` → `useProcessPayment()` | Mutación `checkout.pay()` (sin reintentos, para no cobrar dos veces) |
| `application/hooks/reservations.hooks.ts` → `useAwaitConfirmation(reservationId)` | Se suscribe a la sala `reservation:{id}` (`payment:processed`, `reservation:confirmed`, `reservation:failed`) y, como **respaldo**, consulta `GET /reservations/:id` cada 2 s mientras espera |
| `ui/pages/TicketPage.tsx` + `useTicket()` | Boleto: código de reserva, vuelo, asiento, cabina, pasajero, precio y pago |
| `ui/pages/MyTripsPage.tsx` | Mis reservas, pagos y reembolsos, y búsqueda de boleto por código |
| `application/hooks/seats.hooks.ts` | En las demás pestañas, `seat:occupied` → `applySeatEvent` deja el asiento **ocupado y no seleccionable** (`isSelectable` = false) |
| `infrastructure/api/payment.api.ts` | `pay()` → `POST /payments`; `myPayments()`, `refund()` |
| `infrastructure/api/monolith.api.ts` | `ticketByReservation()` → `GET /reservations/:id/ticket`; `ticketByCode()` → `GET /tickets/:code` |

### Payment Service (PS)

| Archivo | Responsabilidad |
|---|---|
| `PS/infrastructure/http/routes.ts` | `POST /payments` (201 aprobado / 402 rechazado), `GET /payments/me`, `GET /payments/:id`, `POST /payments/:id/refunds` |
| `PS/application/payment.use-cases.ts` → `ProcessPaymentUseCase` | Verifica dueño, estado y vencimiento de la intención; la pasa **atómicamente** a `PROCESSING`; cobra con la pasarela; guarda el pago y **publica `PaymentProcessed`** |
| `PS/application/payment.use-cases.ts` → `RefundPaymentUseCase`, `PaymentEventHandlers` | Reembolsos (manuales y automáticos ante `ReservationFailed` o vuelo cancelado) y asociación del código de reserva al pago |
| `PS/infrastructure/gateway/fake-payment.gateway.ts` | Pasarela simulada: `…0002` rechazada, `…0069` reportada, el resto aprobada |
| `PS/infrastructure/persistence/mongo.repositories.ts` | `intenciones_pago`, `pagos` (índice único parcial: **un pago aprobado por reserva**), `reembolsos` |
| `PS/domain/payment.ts` | Entidades, puertos (`PaymentGateway`, `ReservationHoldClient`) y mapeo a DTO (solo últimos 4 dígitos) |

### Monolito (MONO)

| Archivo | Responsabilidad |
|---|---|
| `modules/reservation/infrastructure/messaging/reservation-events.consumer.ts` | Suscripción a `PaymentProcessed`, `PaymentRefunded` y `FlightStatusChanged` |
| `modules/reservation/application/confirmation.use-cases.ts` → `ConfirmReservationUseCase` | Pago aprobado → `occupy()` (**LOCKED→OCCUPIED permanente**, CAS) → registra el cliente → reserva `CONFIRMED` con **código PNR único** (reintenta si colisiona el índice único) → **publica `ReservationConfirmed`**. Si el asiento se perdió → `ReservationFailed`. Idempotente ante eventos repetidos |
| `modules/reservation/application/confirmation.use-cases.ts` → `CancelReservationOnRefundUseCase` | Reembolso → reserva `CANCELLED` y asiento liberado (`SeatReleased`) |
| `modules/customer/application/customer.use-cases.ts` → `CustomerRegistryService` | Crea o actualiza el pasajero (colección `clientes`, identidad por documento) |
| `modules/reservation/application/reservation-query.use-cases.ts` → `GetTicketUseCase` | Arma el boleto (`TicketDto`) por id o por código |
| `modules/reservation/infrastructure/http/reservation.routes.ts` | `GET /reservations/:id`, `/reservations/:id/ticket`, `/tickets/:code`, `/reservations/me` |

### Realtime Gateway (RG)

| Archivo | Responsabilidad |
|---|---|
| `RG/application/event-router.ts` | `ReservationConfirmed` → **`seat:occupied` global** (salas `flight:{id}` y dashboards) + `reservation:confirmed` privado (salas `reservation:{id}` y `user:{id}`). `PaymentProcessed` se emite **sin datos del pasajero** |

**Pruebas:** `monolith.e2e.spec.ts` (PaymentProcessed → CONFIRMED, OCCUPIED, boleto por id y por código; asiento perdido → `ReservationFailed`), `PS/test/payment.spec.ts` (validaciones, doble cobro concurrente → 1 aprobado y 1 409, rechazo y reintento, reembolso automático), `integration-tests/full-flow.spec.ts` (el otro usuario recibe `seat:occupied` con el mismo código).

---

## HU4 · Dashboard / vista de estado del vuelo

> Ver en tiempo real la ocupación del vuelo (disponibles, bloqueados, ocupados) para monitorear la demanda.
> **Tiempo real:** el dashboard reacciona al instante a cada bloqueo, liberación por expiración y reserva confirmada.

### Flujo

```
[MONO] SeatLocked / SeatReleased / ReservationConfirmed --> Kafka --> [FMS] consumers.ts
    [FMS] DashboardService.applySeatEvent: actualiza `ocupacion_vuelos` (update atómico, idempotente)
          --publish FlightOccupancyUpdated--> Kafka --> [RG] dashboard:occupancy --> [DashboardPage / FlightMonitorPage]
          --updates$ (RxJS)--> SSE GET /dashboard/flights/:id/stream --> [FlightMonitorPage]
Además [RG] reenvía seat:locked / seat:released / seat:occupied a dashboard:{id} → bitácora de eventos en vivo
```

### Frontend (WEB)

| Archivo | Responsabilidad |
|---|---|
| `ui/pages/DashboardPage.tsx` | Vista general: totales (disponibles, bloqueados, ocupados, % ocupación), vuelos por estado, ocupación por vuelo y estado de la conexión en vivo |
| `ui/pages/FlightMonitorPage.tsx` | Monitor de un vuelo (`/dashboard/flights/:id`): métricas, barra de ocupación, mapa de asientos en modo lectura, bitácora de eventos, historial de estados y, para ADMIN, cambio de estado |
| `application/hooks/dashboard.hooks.ts` → `useLiveDashboard(date)` | `overview` y `flightsOccupancy` del FMS + SSE `/dashboard/stream` + sala `flights:list` (`dashboard:occupancy`, `flight:status-changed`) → `upsertOccupancy` sobre la caché |
| `application/hooks/dashboard.hooks.ts` → `useFlightMonitor(flightId)` | Ocupación + SSE `/dashboard/flights/:id/stream` + sala `dashboard:{id}` (`seat:locked`, `seat:released` con motivo "Tiempo de bloqueo expirado", `seat:occupied`) → bitácora en vivo |
| `application/hooks/dashboard.hooks.ts` → `useChangeFlightStatus()` | `PATCH /flights/:id/status` (ADMIN) |
| `application/hooks/seats.hooks.ts` → `useLiveSeatMap(id, 'dashboard')` | Mapa en vivo del monitor usando la sala `dashboard:{id}` |
| `ui/components/Occupancy.tsx` + `domain/occupancy.ts` | Barra y leyenda de ocupación (`occupancyShares`, `totalsOf`, `upsertOccupancy`) |
| `ui/components/Realtime.tsx` | Indicador de conexión (conectado / reconectando / sin conexión) y bitácora |
| `infrastructure/api/flight-management.api.ts` | `overview()`, `flightsOccupancy()`, `occupancy()`, `streamOccupancy()` (SSE), `statusHistory()`, `changeStatus()` |

### Flight Management Service (FMS)

| Archivo | Responsabilidad |
|---|---|
| `FMS/infrastructure/messaging/consumers.ts` | `SeatLocked` → LOCKED, `SeatReleased` → AVAILABLE, `ReservationConfirmed` → OCCUPIED |
| `FMS/application/dashboard.use-cases.ts` → `DashboardService` | `ensure()` inicializa la proyección con el estado real de los asientos del monolito. `applySeatEvent()` aplica el cambio, emite en `updates$` (SSE) y **publica `FlightOccupancyUpdated`**, y detecta agotado. `overview()` agrega los vuelos próximos. `stream()` filtra por vuelo |
| `FMS/domain/occupancy.ts` | Proyección `FlightOccupancy` con el **estado por asiento** (idempotencia), `recount`, `occupancyRate`, `soldOutTransition` |
| `FMS/infrastructure/persistence/mongo.repositories.ts` → `MongoOccupancyRepository.applySeatState` | *Update pipeline* atómico: fija el asiento y recalcula los contadores en una sola operación |
| `FMS/infrastructure/http/routes.ts` | `GET /dashboard/overview`, `/dashboard/flights`, `/dashboard/flights/:id/occupancy`, **SSE** `/dashboard/flights/:id/stream` (snapshot + cambios) y `/dashboard/stream`; historial de estados |
| `FMS/infrastructure/clients/monolith-catalog.client.ts` | Lee `/internal/flights` y `/internal/flights/:id/seats` del monolito (sincronización e inicialización) |
| `FMS/container.ts` | Ensambla todo y reacciona (RxJS) a sus propios `FlightStatusChanged` para refrescar el SSE |
| `MONO/modules/analytics/*` | Métricas complementarias: `/analytics/flights/:id/metrics` (conversión e ingresos) y reportes de demanda (ADMIN) |

### Realtime Gateway (RG)

| Archivo | Responsabilidad |
|---|---|
| `RG/application/event-router.ts` | `FlightOccupancyUpdated` → `dashboard:occupancy` a `dashboard:{id}`, `dashboard:all` y `flights:list`; los eventos de asiento también llegan a las salas de dashboard |
| `RG/infrastructure/http/routes.ts` | SSE `GET /api/v1/sse/dashboard/:id|all` y `/gateway/stats` |

**Pruebas:** `FMS/test/fms.e2e.spec.ts` (reacciona a los tres eventos, ignora duplicados y marca agotado), `integration-tests/full-flow.spec.ts` (el espectador recibe `dashboard:occupancy` con bloqueados = 1 y luego ocupados = 1).

---

## 5. Resumen de trazabilidad: regla de tiempo real → evento → código

| Historia | Disparador | Evento de dominio (Kafka) | Productor | Evento Socket.io → sala | Consumidor en el frontend |
|---|---|---|---|---|---|
| HU1 | Admin o feed de aerolínea cambia el estado; vuelo agotado | `FlightStatusChanged` | `FMS/application/flight-management.use-cases.ts` | `flight:status-changed` → `flights:list` | `useFlightSearch` → `applyFlightStatusChange` |
| HU1 | Cambia la ocupación | `FlightOccupancyUpdated` | `FMS/application/dashboard.use-cases.ts` | `dashboard:occupancy` → `flights:list` | `useFlightSearch` → `applyOccupancyToFlights` |
| HU2 | Clic en asiento libre | `SeatLocked` | `MONO/.../seat-hold.use-cases.ts` (`CreateSeatHoldUseCase`) | `seat:locked` → `flight:{id}` | `useLiveSeatMap` → `applySeatEvent` |
| HU2 | Vence el bloqueo (5–10 min) | `SeatReleased(EXPIRED)` | `ExpireSeatHoldsUseCase` + `hold-expiration.scheduler.ts` | `seat:released` → `flight:{id}` | `useLiveSeatMap`, `CheckoutProvider` |
| HU3 | Pago aprobado | `PaymentProcessed` → `ReservationConfirmed` | `PS/.../payment.use-cases.ts` → `MONO/.../confirmation.use-cases.ts` | `seat:occupied` (global) → `flight:{id}`; `reservation:confirmed` → `reservation:{id}` | `useLiveSeatMap`, `useAwaitConfirmation` |
| HU4 | Cualquiera de los anteriores | `FlightOccupancyUpdated` (+ eventos de asiento) | `FMS/application/dashboard.use-cases.ts` | `dashboard:occupancy`, `seat:*` → `dashboard:{id}`/`all` · SSE del FMS | `useLiveDashboard`, `useFlightMonitor` |

## 6. Cómo verificarlo

- **Automático (backend):** `cd backend && npm run test:all` (unitarias por servicio + integración de 4 servicios).
- **Automático (frontend):** `cd frontend && npm test`.
- **De punta a punta con la infraestructura real:** `cd backend && powershell -ExecutionPolicy Bypass -File .\scripts\probar-flujo.ps1`.
- **Manual en el navegador:** dos ventanas en http://localhost:8090 con `cliente@skyandes.com` y `cliente2@skyandes.com`, más `/dashboard` con `espectador@skyandes.com` (ver `frontend/README.md`, sección 3).
