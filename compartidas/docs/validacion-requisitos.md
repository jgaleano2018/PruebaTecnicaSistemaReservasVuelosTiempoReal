# Validación de requisitos

Resultado de la revisión técnica de los 4 proyectos de backend contra los criterios de la prueba.

## 1. Objetivo: arquitectura, calidad de código, concurrencia y comunicación cliente-servidor

| Criterio | Cumplimiento | Evidencia |
|---|---|---|
| Arquitectura de software | Híbrido monolito modular + 3 microservicios, hexagonal, comunicados por Kafka, según el diagrama | [`architecture.md`](architecture.md), `backend/*/src` |
| Toma de decisiones | Decisiones justificadas: qué queda en el monolito y qué se separa, CAS atómico, saga, CQRS del dashboard, fan-out del gateway | [`architecture.md`](architecture.md) |
| Manejo de concurrencia | Compare-and-set atómico sobre `asientos` con índice único; `PENDING → PROCESSING` contra el doble cobro; transiciones condicionales | `mongo-reservation.repositories.ts`, `payment.use-cases.ts` |
| Comunicación cliente-servidor | REST + Socket.io + SSE, con contratos tipados compartidos (`cliente/shared/src/realtime`) | Realtime Gateway, `api.md` |

## 2. Descripción del problema

| Requisito | Cómo se cumple | Prueba automatizada |
|---|---|---|
| Buscar vuelos | `GET /flights/search` con origen, destino, fecha, clase y precio máximo | `monolith.e2e.spec.ts` › HU1 |
| Mapa de asientos en tiempo real | `GET /flights/:id/seats` + sala `flight:{id}` con `seat:locked`, `seat:released` y `seat:occupied` | `full-flow.spec.ts` |
| Bloquear asientos temporalmente | `POST /checkout/holds` (Payment) → `POST /reservations/holds` (monolito) → `SeatLocked` | `payment.spec.ts`, `monolith.e2e.spec.ts` |
| Confirmar el pasaje | `POST /payments` → `PaymentProcessed` → `ReservationConfirmed` con PNR y boleto | `full-flow.spec.ts` (paso 4) |
| Los demás usuarios ven el cambio al instante | El evento Kafka se reparte por Socket.io a la sala del vuelo; lo verifica un segundo cliente conectado | `full-flow.spec.ts` (Bob recibe `seat:locked` y `seat:occupied`) |
| Sin double booking | 25 solicitudes concurrentes sobre el mismo asiento: 1 éxito y 24 respuestas 409 | `monolith.e2e.spec.ts` › concurrencia |

## 3. El backend compila y se ejecuta sin errores en consola

| Verificación | Resultado |
|---|---|
| `npm run build:all` (tsc `strict`) en shared, shared-kernel y los 4 servicios | Sin errores |
| `npm run lint` (ESLint + typescript-eslint, `no-console`, `eqeqeq`) | 0 errores, 0 advertencias |
| `npm run test:all` | Monolito 11 · FMS 4 · Payment 6 · Gateway 5 · integración 1: todas pasan, sin salida de consola (logs silenciados en pruebas) |
| Arranque de cada `dist/main.js` | Sin advertencias (se eliminó un índice duplicado de Mongoose en `pagos`). Solo logs estructurados de nivel info/warn |
| Imagen Docker | Se reprodujeron los pasos del Dockerfile (paquetes locales copiados con `install-links`) y el servicio arranca desde `node_modules` + `dist` |

> Nota: las pruebas automatizadas usan adaptadores en memoria para MongoDB y Kafka. La ejecución con la infraestructura real
> se hace con `docker compose up` (ver [`ejecucion-local.md`](ejecucion-local.md)).

## 4. Gestión del tiempo límite del bloqueo temporal

| Mecanismo | Detalle | Evidencia |
|---|---|---|
| Duración configurable y validada | `SEAT_LOCK_MINUTES` (7 por defecto). El servicio no arranca con valores fuera de 5–10 | `config/env.ts`, `seat-lock-config.spec.ts` |
| Expiración registrada en el asiento y la reserva | `lockExpiresAt` en `asientos` y `holdExpiresAt` en `reservas`; se devuelve `expiresAt` al cliente para mostrar la cuenta regresiva | `seat-hold.use-cases.ts` |
| Lectura consistente antes del barrido | `effectiveSeatStatus`: un bloqueo vencido se trata como disponible en consultas, búsquedas y nuevos bloqueos | `reservation.entities.ts` |
| Liberación activa | Barrido reactivo `interval + exhaustMap` cada 5 s: libera condicionalmente (seguro con varias réplicas), marca la reserva `EXPIRED` y emite `SeatReleased(EXPIRED)` | `hold-expiration.scheduler.ts`, prueba "libera el asiento por tiempo expirado" |
| Pago fuera de tiempo | El Payment Service rechaza intenciones vencidas (`HOLD_EXPIRED`) y las marca `EXPIRED` al recibir `SeatReleased` | `payment.spec.ts` |
| Carrera pago/expiración | Si el asiento ya fue tomado por otro usuario se emite `ReservationFailed` y se reembolsa automáticamente (saga) | prueba "si el asiento se perdió antes del pago" |
| Tiempo real | Dashboard y mapa reciben `seat:released` y `dashboard:occupancy` al liberar | `fms.e2e.spec.ts` |

## 5. Código limpio, manejo de errores y separación de responsabilidades (SOLID, DRY)

| Aspecto | Implementación |
|---|---|
| Separación de responsabilidades | Hexagonal por módulo/servicio: `domain` (entidades, reglas, puertos) · `application` (casos de uso) · `infrastructure` (HTTP, Mongo, Kafka, WebSocket) · `container.ts` (inyección) |
| SOLID | Un caso de uso por clase, puertos pequeños, adaptadores intercambiables (Mongo/memoria, Kafka/memoria), inversión de dependencias en el composition root |
| DRY | `backend/shared-kernel` concentra la infraestructura técnica común (antes duplicada en cada servicio): JWT, errores, validación, SSE, Event Bus, fábrica de Express, ciclo de vida del proceso. `cliente/shared` concentra DTOs, eventos, validaciones y reglas (transiciones de estado de vuelo, zona horaria de negocio) |
| Manejo de errores | Errores de dominio tipados → `errorHandler` único con formato uniforme; validación Zod con detalle por campo; errores remotos propagados; reintentos en Kafka; `unhandledRejection` y `uncaughtException` registrados; apagado ordenado |
| Seguridad | JWT con roles (CUSTOMER, ADMIN, SPECTATOR), endpoints internos con API key, helmet, límite de tamaño del body, sin datos de tarjeta completos ni PII en eventos de tiempo real |

## Ajustes hechos en esta revisión

1. Se extrajo `backend/shared-kernel`, eliminando unas 1.500 líneas de código técnico que estaban copiadas en el FMS, el Payment Service y el Realtime Gateway.
2. Las reglas duplicadas (transiciones de estado de vuelo, estados no reservables, zona horaria y rango de fecha) pasaron a `cliente/shared/src/rules`.
3. Se unificaron la fábrica de Express (`createServiceApp`), el bus (`createEventBus`), el ciclo de vida (`runService`, `registerProcessHandlers`) y la creación de colecciones (`ensureCollections`).
4. Se agregaron ESLint para todo el backend, scripts `build:all`, `test:all` e `install:all`, y la prueba de los límites del bloqueo.
5. Los logs quedan silenciados en las pruebas y se eliminaron casts redundantes tras la validación tipada.
6. Los Dockerfiles se simplificaron: la imagen final solo contiene `package.json`, `node_modules` y `dist`.
