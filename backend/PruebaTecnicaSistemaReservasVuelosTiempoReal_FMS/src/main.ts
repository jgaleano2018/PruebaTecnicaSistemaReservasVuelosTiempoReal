import { defer, lastValueFrom, retry, timer } from 'rxjs';
import { env } from './config/env';
import { createEventBus, logger, registerProcessHandlers, runService } from '@reservas-vuelos/service-kernel';
import { connectMongo, disconnectMongo, ensureCollections } from '@reservas-vuelos/service-kernel/database';
import { createHttpApp } from './app';
import { compose } from './container';
import {
  FLIGHT_DB_COLLECTIONS,
  MongoManagedFlightRepository,
  MongoOccupancyRepository,
  MongoStatusHistoryRepository,
  MongoSyncLogRepository,
} from './infrastructure/persistence/mongo.repositories';
import { HttpMonolithCatalogClient } from './infrastructure/clients/monolith-catalog.client';

const SERVICE = 'flight-management-service';

runService(SERVICE, async () => {
  await connectMongo(env.MONGO_URI);
  await ensureCollections(FLIGHT_DB_COLLECTIONS);

  const bus = createEventBus({
    kind: env.EVENT_BUS,
    source: SERVICE,
    brokers: env.KAFKA_BROKERS,
    clientId: env.KAFKA_CLIENT_ID,
    groupId: env.KAFKA_GROUP_ID,
  });

  const c = compose(
    {
      flights: new MongoManagedFlightRepository(),
      history: new MongoStatusHistoryRepository(),
      occupancy: new MongoOccupancyRepository(),
      syncLog: new MongoSyncLogRepository(),
      catalog: new HttpMonolithCatalogClient(env.MONOLITH_URL, env.INTERNAL_API_KEY),
    },
    bus,
    { jwtSecret: env.JWT_SECRET, jwtExpiresIn: env.JWT_EXPIRES_IN, syncDaysAhead: env.SYNC_DAYS_AHEAD },
  );
  await bus.start();

  const server = createHttpApp(c.router, { corsOrigin: env.CORS_ORIGIN, service: SERVICE }).listen(env.PORT, () =>
    logger.info(`Flight Management Service en http://localhost:${env.PORT}/api/v1`),
  );

  // Sincronización inicial reactiva con reintentos hasta que el monolito esté disponible
  lastValueFrom(defer(() => c.syncFlights.execute()).pipe(retry({ count: 30, delay: (_e, i) => timer(Math.min(i * 2000, 10000)) })))
    .then((n) => logger.info({ flights: n }, 'Catálogo de vuelos sincronizado desde el monolito'))
    .catch((err) => logger.error({ err }, 'No fue posible sincronizar el catálogo'));

  registerProcessHandlers(SERVICE, [() => new Promise((r) => server.close(r)), () => bus.stop(), () => disconnectMongo()]);
});
