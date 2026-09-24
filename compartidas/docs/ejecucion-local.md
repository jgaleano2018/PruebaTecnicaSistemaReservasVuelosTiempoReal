# Ejecución local

## 1. Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Docker Desktop | 4.22 o superior (Compose 2.20 o superior) | Kafka, MongoDB y los servicios en contenedores |
| Node.js / npm | 22 / 10 | Ejecutar sin contenedores, pruebas y lint |

En Docker Desktop, en *Settings → Resources*, asigna al menos 6 GB de RAM. En Windows usa el motor WSL 2.

## 2. Todo en Docker

```bash
cd backend
docker compose up -d --build
docker compose ps
```

Orden de arranque automático: MongoDB y Kafka (healthchecks) → monolito (crea colecciones y carga la data inicial la primera vez) →
Flight Management (sincroniza el catálogo desde el monolito, con reintentos) → Payment → Realtime Gateway.

Comprobaciones:

```bash
curl http://localhost:3000/health
docker exec reservas-mongo mongosh --quiet --eval "db.adminCommand('listDatabases').databases.map(d => d.name)"
docker exec reservas-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```

Los tópicos `reservas.*` aparecen cuando arrancan los servicios. También puedes verlos en Kafka UI: http://localhost:8085.

### Levantar un solo proyecto

Cada carpeta de servicio tiene su `docker-compose.yml`, que incluye `backend/infra/docker-compose.infra.yml`.
Todos comparten el nombre de proyecto `reservas-vuelos` y la red `reservas-net`:

```bash
cd backend/PruebaTecnicaSistemaReservasVuelosTiempoReal_Backend && docker compose up -d --build
cd ../PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS           && docker compose up -d --build
```

### Escalar el Realtime Gateway

Cada réplica usa su propio consumer group de Kafka, así que todas reciben todos los eventos. Para varias réplicas, quita
`container_name` y `ports` del servicio, colócalo detrás de un balanceador con *sticky sessions* y ejecuta
`docker compose up -d --scale realtime-gateway=3`.

## 3. Servicios con npm (infraestructura en Docker)

```bash
cd backend
docker compose -f infra/docker-compose.infra.yml -p reservas-vuelos up -d
npm install
npm run install:all     # cliente/shared → shared-kernel → 4 servicios
```

Después, en cada servicio: `cp .env.example .env` y `npm run dev` (recarga en caliente con `tsx`), o `npm run build && npm start`.
Los `.env.example` ya apuntan a `localhost:27017` (MongoDB) y `localhost:29092` (listener externo de Kafka).

> Si modificas `cliente/shared` o `backend/shared-kernel`, vuelve a ejecutar `npm run install:all`. Los servicios usan
> `install-links=true` (`.npmrc`), que copia esos paquetes dentro de `node_modules` en lugar de enlazarlos.

Carga de datos manual en el monolito: `npm run seed` (si la base está vacía) o `npm run seed -- --reset` (borra y recarga).

## 4. Variables de entorno principales

| Variable | Servicio | Por defecto | Descripción |
|---|---|---|---|
| `SEAT_LOCK_MINUTES` | Monolito | 7 | Duración del bloqueo temporal (validada entre 5 y 10) |
| `HOLD_EXPIRATION_SWEEP_MS` | Monolito | 5000 | Frecuencia del barrido que libera bloqueos vencidos |
| `MAX_ACTIVE_HOLDS_PER_USER` | Monolito | 4 | Asientos bloqueados simultáneamente por usuario y vuelo |
| `SEED_ON_START` | Monolito | true | Crea colecciones y carga datos si la base está vacía |
| `EVENT_BUS` | Todos | kafka | `kafka` o `memory` (solo para pruebas) |
| `KAFKA_BROKERS` | Todos | localhost:29092 | En Docker: `kafka:9092` |
| `JWT_SECRET` | Todos | (demo) | Debe ser el mismo en todos los servicios |
| `INTERNAL_API_KEY` | Monolito, FMS | (demo) | Protege los endpoints `/internal/*` |
| `MONOLITH_URL` | FMS, Payment | http://localhost:3000 | En Docker: `http://monolith:3000` |
| `GATEWAY_LATENCY_MS` | Payment | 400 | Latencia simulada de la pasarela |

## 5. Pruebas y calidad

```bash
cd backend
npm run lint
npm run build:all
npm run test:all
```

## 6. Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `additional property include is not allowed` | Docker Desktop desactualizado: actualízalo a 4.22 o superior |
| `port is already allocated` (27017) | Hay un MongoDB local corriendo; detén el servicio o cambia el puerto publicado |
| Kafka se reinicia en bucle | Falta memoria en Docker Desktop |
| El FMS muestra "No fue posible sincronizar" | El monolito no estaba arriba; se reintenta solo, o usa `POST /api/v1/flights/sync` (admin) |
| Quiero reiniciar los datos | `docker compose down -v` y luego `docker compose up -d --build` |
