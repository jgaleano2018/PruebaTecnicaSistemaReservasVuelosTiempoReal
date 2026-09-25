import { defer, lastValueFrom, retry, timer } from 'rxjs';
import { env } from './config/env';
import { createHttpApp } from './app';
import { compose } from './container';
import { connectMongo, disconnectMongo } from './shared/infrastructure/database/mongo';
import { logger } from './shared/infrastructure/logging/logger';
import { KafkaEventBus } from './shared/infrastructure/messaging/kafka-event-bus';
import { InMemoryEventBus } from './shared/infrastructure/messaging/in-memory-event-bus';
import { EventBus } from './shared/application/event-bus.port';
import {
  FLIGHT_DB_COLLECTIONS,
  MongoManagedFlightRepository,
  MongoOccupancyRepository,
  MongoStatusHistoryRepository,
  MongoSyncLogRepository,
} from './infrastructure/persistence/mongo.repositories';
import { HttpMonolithCatalogClient } from './infrastructure/clients/monolith-catalog.client';

async function bootstrap() {
  await connectMongo(env.MONGO_URI);
  // Crea explícitamente las colecciones e índices de flight-db
  for (const model of FLIGHT_DB_COLLECTIONS) {
    await model.createCollection().catch(() => undefined);
    await model.syncIndexes();
  }

  const bus: EventBus =
    env.EVENT_BUS === 'kafka'
      ? new KafkaEventBus({
          clientId: env.KAFKA_CLIENT_ID,
          brokers: env.KAFKA_BROKERS.split(','),
          groupId: env.KAFKA_GROUP_ID,
          source: 'flight-management-service',
          logger,
        })
      : new InMemoryEventBus('flight-management-service');

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
  const app = createHttpApp(c.router, { corsOrigin: env.CORS_ORIGIN, service: 'flight-management-service' });
  const server = app.listen(env.PORT, () => logger.info(`Flight Management Service en http://localhost:${env.PORT}/api/v1`));

  // Sincronización inicial reactiva con reintentos hasta que el monolito esté disponible
  lastValueFrom(defer(() => c.syncFlights.execute()).pipe(retry({ count: 30, delay: (_e, i) => timer(Math.min(i * 2000, 10000)) })))
    .then((n) => logger.info({ flights: n }, 'Catálogo de vuelos sincronizado desde el monolito'))
    .catch((err) => logger.error({ err }, 'No fue posible sincronizar el catálogo'));

  const shutdown = async () => {
    server.close();
    await bus.stop();
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'No fue posible iniciar el Flight Management Service');
  process.exit(1);
});
