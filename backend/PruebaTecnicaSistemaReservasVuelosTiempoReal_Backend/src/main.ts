import { env } from './config/env';
import { createHttpApp } from './app';
import { composeModules, mongoInfrastructure } from './container';
import { connectMongo, disconnectMongo } from './shared/infrastructure/database/mongo';
import { logger } from './shared/infrastructure/logging/logger';
import { KafkaEventBus } from './shared/infrastructure/messaging/kafka-event-bus';
import { InMemoryEventBus } from './shared/infrastructure/messaging/in-memory-event-bus';
import { EventBus } from './shared/application/event-bus.port';
import { seedDatabase } from './database/seed/seed';

async function bootstrap(): Promise<void> {
  await connectMongo(env.MONGO_URI);
  if (env.SEED_ON_START) await seedDatabase({ onlyIfEmpty: true });

  const bus: EventBus =
    env.EVENT_BUS === 'kafka'
      ? new KafkaEventBus({
          clientId: env.KAFKA_CLIENT_ID,
          brokers: env.KAFKA_BROKERS.split(','),
          groupId: env.KAFKA_GROUP_ID,
          source: 'monolith',
          logger,
        })
      : new InMemoryEventBus('monolith');

  const modules = composeModules(mongoInfrastructure(), bus, {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    internalApiKey: env.INTERNAL_API_KEY,
    seatLockMinutes: env.SEAT_LOCK_MINUTES,
    maxActiveHoldsPerUser: env.MAX_ACTIVE_HOLDS_PER_USER,
    sweepPeriodMs: env.HOLD_EXPIRATION_SWEEP_MS,
  });

  // Los handlers se registran al componer los módulos; luego se inicia el consumidor Kafka.
  await bus.start();
  modules.reservation.scheduler.start();

  const app = createHttpApp(modules, { corsOrigin: env.CORS_ORIGIN });
  const server = app.listen(env.PORT, () => logger.info(`Monolito modular escuchando en http://localhost:${env.PORT}/api/v1`));

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Apagando monolito...');
    modules.reservation.scheduler.stop();
    server.close();
    await bus.stop();
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}


bootstrap().catch((err) => {
  logger.fatal({ err }, 'No fue posible iniciar el monolito');
  process.exit(1);
});
