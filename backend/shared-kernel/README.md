# @reservas-vuelos/service-kernel

Núcleo técnico compartido por el monolito modular y los tres microservicios. Corresponde a la "Capa de Infraestructura y
Comunicación" del diagrama. **No contiene lógica de negocio**, solo piezas transversales:

| Carpeta | Contenido |
|---|---|
| `domain/errors.ts` | `DomainError`, `NotFoundError`, `ConflictError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError` |
| `application/` | Puertos `EventBus` (con `events$` reactivo) y `Clock` |
| `infrastructure/auth` | `JwtService`, middlewares `authenticate`, `optionalAuth`, `authorize(roles)` e `internalOnly` |
| `infrastructure/http` | `createServiceApp`, `validate` (Zod), `asyncHandler`, `ok`, `errorHandler`, `streamSse` |
| `infrastructure/messaging` | `KafkaEventBus`, `InMemoryEventBus` + `InMemoryBroker` (pruebas) y `createEventBus` |
| `infrastructure/logging` | Logger estructurado (pino) |
| `infrastructure/runtime` | `runService` y `registerProcessHandlers` (apagado ordenado, errores no controlados) |
| `infrastructure/database` | `connectMongo`, `ensureCollections` (se importa desde `@reservas-vuelos/service-kernel/database`) |

Los servicios lo instalan con `"@reservas-vuelos/service-kernel": "file:../shared-kernel"` y `install-links=true`.
Tras modificarlo, ejecuta `npm run install:all` desde `backend/`.
