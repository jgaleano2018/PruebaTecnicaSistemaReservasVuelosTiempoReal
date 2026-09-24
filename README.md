# Sistema de Reservas de Vuelos en Tiempo Real

Prueba técnica fullstack: búsqueda de vuelos, mapa de asientos en tiempo real, bloqueo temporal (5-10 min) sin
sobre-reservas (double booking), pago ficticio con boleto y código único, y dashboard de ocupación en vivo.

Arquitectura según [`arquitectura/DiagramaArquitecturaPruebaTecnicaSistemaReservaVuelos.png`](arquitectura/DiagramaArquitecturaPruebaTecnicaSistemaReservaVuelos.png):
un **monolito modular** con arquitectura hexagonal + **3 microservicios**, comunicados por **Kafka** (Event Bus).

| Proyecto | Carpeta | Puerto | Base de datos |
|---|---|---|---|
| Monolito modular (Vuelos, Reservas, Clientes, Tiempo Real, Dashboard) | [`backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_Backend`](backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_Backend) | 3000 | `reservas_vuelos_db` |
| Flight Management Service | [`backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS`](backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS) | 3001 | `flight-db` |
| Payment Service | [`backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS`](backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_PS) | 3002 | `payment-db` |
| Realtime Gateway (Socket.io + SSE) | [`backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG`](backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_RG) | 4000 | — |
| DTOs / eventos / validaciones compartidas | [`cliente/shared`](cliente/shared) | — | — |
| Infraestructura (Kafka, MongoDB, Kafka UI) | [`backend/infra`](backend/infra) | 29092 / 27017 / 8085 | — |

**Stack:** Node.js 22 · Express · TypeScript · MongoDB + Mongoose · KafkaJS · Socket.io · SSE · RxJS · Zod · JWT · Jest.

## Despliegue local con Docker Desktop

```bash
cd backend
docker compose up -d --build        # infraestructura + monolito + 3 microservicios
docker compose logs -f monolith     # la primera vez carga la data inicial (≈320 vuelos, ≈49.000 asientos)
```

Cada proyecto también tiene su propio `docker-compose.yml` (incluye la infraestructura compartida), por lo que
se pueden levantar uno a uno desde su carpeta: `docker compose up -d --build`. Todos usan el nombre de proyecto
`reservas-vuelos` y la red `reservas-net`. Orden recomendado: monolito → FMS → Payment → Realtime Gateway.

Usuarios de prueba (se crean en la carga inicial):

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@skyandes.com | Admin123* |
| Cliente | cliente@skyandes.com | Cliente123* |
| Espectador | espectador@skyandes.com | Espectador123* |

Tarjetas ficticias: `4111 1111 1111 1111` (aprobada) · `4000 0000 0000 0002` (rechazada, fondos insuficientes).

La colección [`backend/requests.http`](backend/requests.http) recorre el flujo completo (VS Code REST Client / IntelliJ).

## Flujo principal de usuario (diagrama)

| Paso | Servicio | Endpoint / evento |
|---|---|---|
| 1. Busca vuelos | Monolito · Módulo Vuelos | `GET /api/v1/flights/search?origin=BOG&destination=MDE&date=YYYY-MM-DD` · tiempo real: `flight:status-changed` |
| 2. Selecciona asiento | Monolito · Módulo Reservas / Payment Service | `GET /api/v1/flights/:id/seats[/:seat]` · `POST /api/v1/checkout/holds` → `SeatLocked` |
| 3. Completa datos y paga | Payment Service | `POST /api/v1/payments` → `PaymentProcessed` |
| 4. Obtiene su boleto | Monolito · Módulo Reservas | `ReservationConfirmed` · `GET /api/v1/tickets/:code` |
| 5. Monitorea en tiempo real | Flight Management Service + Realtime Gateway | `GET /api/v1/dashboard/...` · `dashboard:occupancy` |

Flujo de eventos: **Reservation Service (monolito) → Kafka → Realtime Gateway → clientes (web / mobile / dashboard)**.
Detalle en [`compartidas/docs/architecture.md`](compartidas/docs/architecture.md).

## Pruebas

```bash
# en cada proyecto de backend (adaptadores en memoria, sin Docker)
npm install && npm test
# flujo completo con los 4 servicios en un mismo proceso (HTTP real + WebSocket real + broker en memoria)
cd backend/integration-tests && npm install && npm test
```
