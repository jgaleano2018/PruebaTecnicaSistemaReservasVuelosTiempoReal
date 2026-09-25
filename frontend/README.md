# Frontend · Sistema de Reservas de Vuelos en Tiempo Real

Aplicación **React 19 + TypeScript + Vite** que implementa los clientes **Web (React)** y **Dashboard / Admin (React)**
del [diagrama de arquitectura](../arquitectura/DiagramaArquitecturaPruebaTecnicaSistemaReservaVuelos.png):
búsqueda de vuelos, mapa interactivo de asientos sincronizado en tiempo real entre pestañas y navegadores,
bloqueo temporal con cuenta regresiva, pago ficticio con boleto y código único, y un dashboard de ocupación en vivo.

| Historia | Pantalla | Tiempo real |
|---|---|---|
| HU1 Búsqueda y filtro | `/` (origen, destino, fecha, cabina, precio máx.) | `flight:status-changed` y `dashboard:occupancy` (sala `flights:list`) actualizan resultados sin recargar |
| HU2 Selección y bloqueo | `/flights/:flightId` | `seat:locked` / `seat:released` / `seat:occupied` (sala `flight:{id}`) + temporizador del bloqueo (5-10 min) |
| HU3 Confirmación y boleto | `/checkout` → `/reservations/:id/ticket` | `payment:processed` y `reservation:confirmed` (sala `reservation:{id}`), consulta REST de respaldo |
| HU4 Dashboard | `/dashboard`, `/dashboard/flights/:flightId` | SSE del Flight Management Service + WebSocket del gateway (salas `flights:list` y `dashboard:{id}`) |

Además: `/my-trips` (reservas, pagos, reembolsos, búsqueda de boleto por código), `/profile` (datos de contacto)
y `/admin` (gestión de estados de vuelo, sincronización, reportes, clientes, catálogo y estado del bus de eventos).

---

## 1. Requisitos

- **Node.js 20 o superior** (probado con Node 22) y npm 10.
- El **backend en ejecución** (monolito :3000, FMS :3001, Payment :3002, Realtime Gateway :4000). Ver el
  [README raíz](../README.md). Con Docker Desktop: `cd backend && docker compose up -d --build`.
- Un navegador moderno (Chrome, Edge, Firefox o Safari).

## 2. Instalación y ejecución en desarrollo

```bash
# 1. Desde la raíz del repositorio
cd frontend

# 2. Instalar dependencias
npm install

# 3. Configurar las URLs de los servicios (los valores por defecto sirven para Docker Desktop)
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env

# 4. Levantar el servidor de desarrollo
npm run dev                   # http://localhost:5173
```

El paquete compartido `cliente/shared` (DTOs, eventos, salas de Socket.io y esquemas Zod) se consume **desde su
código fuente** mediante un alias de Vite/TypeScript: no es necesario compilarlo ni publicarlo.

### Variables de entorno (`.env`)

| Variable | Valor por defecto | Uso |
|---|---|---|
| `VITE_MONOLITH_URL` | `http://localhost:3000/api/v1` | Monolito modular (auth, vuelos, reservas, clientes, analytics, SSE de respaldo) |
| `VITE_FMS_URL` | `http://localhost:3001/api/v1` | Flight Management Service (dashboard y gestión de vuelos) |
| `VITE_PAYMENT_URL` | `http://localhost:3002/api/v1` | Payment Service (bloqueo + intención de pago, pagos, reembolsos) |
| `VITE_REALTIME_URL` | `http://localhost:4000` | Realtime Gateway (Socket.io) |
| `VITE_REALTIME_TRANSPORT` | `websocket` | `websocket` (recomendado) o `sse` (respaldo por Server-Sent Events) |

Son variables de **build**: las usa el navegador, por lo que deben ser URLs alcanzables desde el equipo del usuario.

## 3. Probar el tiempo real con dos pestañas / navegadores

1. Abra `http://localhost:5173` en **dos ventanas** (o dos navegadores). La sesión se guarda en `sessionStorage`,
   así que cada pestaña puede tener un usuario distinto.
2. Inicie sesión en una con **Cliente** (`cliente@skyandes.com` / `Cliente123*`) y en la otra con
   `cliente2@skyandes.com` / `Cliente123*` (los botones de "Usuarios de prueba" rellenan el formulario).
3. Busque el mismo vuelo (p. ej. BOG → CTG, mañana) y abra el mapa de asientos en ambas.
4. Seleccione un asiento en la primera: en la segunda aparece **al instante** como *bloqueado* (rayado ámbar)
   y se registra en "Actividad en vivo". Si la segunda intenta tomarlo, recibe el conflicto y el mapa se re-sincroniza.
5. En la primera, "Continuar con el pago": la cuenta regresiva muestra el tiempo del bloqueo. Si se deja expirar,
   el backend emite `SeatReleased` y ambas pestañas liberan el asiento automáticamente.
6. Pague con la tarjeta **Aprobada** (`4111 1111 1111 1111`); la **Rechazada** (`4000 0000 0000 0002`) muestra el error
   y conserva el bloqueo. Al confirmarse, la segunda pestaña ve el asiento como **ocupado** y deshabilitado.
7. Abra `/dashboard` o "Monitorear el vuelo en vivo" (por ejemplo con `espectador@skyandes.com` / `Espectador123*`)
   para ver las métricas y la bitácora de eventos reaccionar a cada bloqueo, liberación y compra.
8. Con `admin@skyandes.com` / `Admin123*`, en el monitor del vuelo cambie el estado (p. ej. *Retrasado 40 min*):
   la lista de resultados de búsqueda de las otras pestañas se actualiza y muestra una notificación.

## 4. Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR (puerto 5173) |
| `npm run build` | Verificación de tipos (`tsc -b`) + build de producción en `dist/` |
| `npm run preview` | Sirve el build de producción (puerto 4173) |
| `npm run typecheck` | Solo verificación de tipos (incluye las pruebas) |
| `npm test` | Pruebas unitarias (Vitest + Testing Library, jsdom) |
| `npm run test:watch` | Pruebas en modo observación |
| `npm run test:coverage` | Pruebas con reporte de cobertura (`coverage/`) |

## 5. Docker

```bash
# Todo el sistema (infraestructura + backend + frontend) desde la carpeta backend:
cd backend && docker compose up -d --build        # frontend en http://localhost:8090

# Solo el frontend (con el backend ya levantado):
cd frontend && docker compose up -d --build
```

La imagen se construye en dos etapas (Node → nginx), ejecuta las pruebas durante el build y sirve la SPA con
*fallback* a `index.html`. Las URLs del backend se pasan como `build args` (ver `docker-compose.yml`).

## 6. Arquitectura

Arquitectura limpia (hexagonal) en el cliente; las dependencias apuntan hacia adentro:

```
src/
├── domain/            Reglas puras sin React ni red: mapa de asientos (aplicar eventos, distribución de cabina),
│                      vuelos, ocupación, temporizador de bloqueo, formato, etiquetas y errores.
├── application/       Casos de uso y estado:
│   ├── ports.ts       Puertos (interfaces) por módulo/servicio del diagrama: AuthGateway, FlightCatalogGateway,
│   │                  ReservationGateway, CustomerGateway, AnalyticsGateway, CheckoutGateway (Payment Service),
│   │                  FlightManagementGateway (FMS) y RealtimeClient (Realtime Gateway).
│   ├── auth/          SessionManager (JWT) + AuthProvider.
│   ├── checkout/      CheckoutProvider: bloqueo temporal + intención de pago, expiración por evento.
│   ├── realtime/      useRealtimeChannel, estado de conexión, re-sincronización al reconectar.
│   └── hooks/         Casos de uso con React Query (búsqueda, mapa en vivo, pago, dashboard, administración).
├── infrastructure/    Adaptadores: HttpClient (fetch + sobre {success,data} + AppError), APIs REST por servicio,
│                      Socket.io y SSE (con conteo de referencias por sala), sessionStorage.
├── ui/                Componentes accesibles, layout, páginas y estilos (design tokens, modo claro/oscuro).
└── app/               Composition root (container.ts), proveedores, router con carga diferida.
```

- **SOLID / DIP:** la UI depende de puertos; `app/container.ts` es el único lugar que conoce las implementaciones.
  Las pruebas sustituyen los adaptadores por dobles (`src/test/fakes.tsx`).
- **Gestión de estado:** React Query para el estado del servidor (los eventos en tiempo real actualizan la caché en
  sitio con funciones puras del dominio) y Context para el estado de cliente (sesión y bloqueo activo).
- **DRY:** DTOs, nombres de eventos, salas y validaciones (Zod, Luhn) provienen de `cliente/shared`, los mismos que
  usa el backend. El registro de suscriptores es común a Socket.io y SSE.
- **Manejo de errores:** `AppError` normalizado con mensajes de negocio (p. ej. `SEAT_NOT_AVAILABLE`), 401 cierra la
  sesión, reintentos solo para fallos de red/5xx, *error boundary* por ruta y estados de carga/vacío/error en cada vista.
- **Accesibilidad (a11y):** HTML semántico y landmarks, enlace "Saltar al contenido", foco visible, etiquetas y
  errores asociados a cada campo, mapa de asientos navegable con flechas (*roving tabindex*) y etiquetas completas
  por asiento, estado nunca solo por color (íconos ×/✓ y textura rayada), anuncios `aria-live` del temporizador y de
  los eventos, pestañas WAI-ARIA, `prefers-reduced-motion` y paleta validada para daltonismo en ambos temas.
- **Diseño reactivo:** mobile-first, menú colapsable, rejillas fluidas y mapa de asientos adaptable.

La revisión del cumplimiento de las reglas del diagrama está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## 7. Endpoints consumidos

| Servicio | Endpoint | Dónde se usa |
|---|---|---|
| Monolito | `POST /auth/login` · `POST /auth/register` · `GET /auth/me` | Login, registro, validación de la sesión |
| Monolito | `GET /flights/search` · `GET /flights/:id` | Búsqueda (HU1) · cabecera del mapa |
| Monolito | `GET /airports` · `/routes` · `/aircraft` | Formulario de búsqueda · catálogo en Admin |
| Monolito | `GET /flights/:id/seats` · `GET /flights/:id/seats/:seat` | Mapa (HU2) · re-consulta del asiento tras un conflicto |
| Monolito | `GET /reservations/me` · `/reservations/:id` · `/reservations/:id/ticket` · `/tickets/:code` | Mis viajes · confirmación · boleto (HU3) |
| Monolito | `GET /customers/me` · `/customers` · `/customers/:id/reservations` · `PATCH /customers/:id/contact` | Perfil · Admin |
| Monolito | `GET /analytics/flights/:id/metrics` · `/analytics/demand` · `/analytics/reports/summary` | Monitor del vuelo · reportes |
| Monolito | `GET /realtime/status` | Estado del bus de eventos (Admin) |
| Payment | `POST /checkout/holds` · `DELETE /checkout/holds/:id` | Bloqueo temporal / liberación (HU2) |
| Payment | `POST /payments` · `GET /payments/me` · `POST /payments/:id/refunds` · `GET /payment-intents/:id` | Pago (HU3) · pagos y reembolsos |
| FMS | `GET /dashboard/overview` · `/dashboard/flights` · `/dashboard/flights/:id/occupancy` | Dashboard (HU4) |
| FMS | `GET /dashboard/stream` · `/dashboard/flights/:id/stream` (SSE) | Ocupación en vivo (HU4) |
| FMS | `GET /flights` · `/flights/:id/status-history` · `PATCH /flights/:id/status` | Admin · historial · cambio de estado |
| FMS | `POST /flights/sync` · `POST /airlines/sync` · `GET /sync/log` | Admin · sincronización |
| Gateway | Socket.io `subscribe:flight`, `subscribe:flights`, `subscribe:dashboard`, `subscribe:reservation` | Todas las vistas en vivo |
| Gateway | `GET /api/v1/sse/flights[/:id]` · `/sse/dashboard/:id` | Transporte SSE alterno (la confirmación de la reserva se consulta por REST) |

Los endpoints `/internal/*` (clave `x-internal-api-key`), `POST /reservations/holds`, `DELETE /reservations/holds/:id`
y el SSE público `GET /realtime/events` son de uso entre servicios y, por diseño, **no** se consumen desde el navegador:
el bloqueo y su liberación pasan por el Payment Service y todos los eventos llegan por el Realtime Gateway.

## 8. Pruebas

68 pruebas unitarias y de integración de componentes:

- **Dominio:** transiciones de asientos por evento (idempotencia, eventos desordenados, otros vuelos), distribución
  de cabina, vuelos, ocupación, temporizador, formato y errores.
- **Infraestructura:** HttpClient (sobre, errores, 401, red, 402 de negocio), adaptadores REST, SSE del FMS,
  cliente Socket.io (salas, filtrado, reconexión y re-suscripción, cambio de token) y cliente SSE.
- **Aplicación:** sesión JWT, login y reconexión del socket, mapa en vivo, búsqueda en vivo, bloqueo/expiración/cambio
  de asiento y confirmación asíncrona (evento y respaldo REST).
- **UI:** accesibilidad y teclado del mapa, temporizador, barra de ocupación, login, selección de asiento con eventos
  de otro pasajero y conflicto 409, pago rechazado y validación Luhn.
