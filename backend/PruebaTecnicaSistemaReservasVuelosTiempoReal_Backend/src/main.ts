import { env } from './config/env';
import { createEventBus, logger, registerProcessHandlers, runService } from '@reservas-vuelos/service-kernel';
import { connectMongo, disconnectMongo } from '@reservas-vuelos/service-kernel/database';
import { createHttpApp } from './app';
import { composeModules, mongoInfrastructure } from './container';
import { seedDatabase } from './database/seed/seed';

runService('monolito', async () => {
  await connectMongo(env.MONGO_URI);
  if (env.SEED_ON_START) await seedDatabase({ onlyIfEmpty: true });

  const bus = createEventBus({
    kind: env.EVENT_BUS,
    source: 'monolith',
    brokers: env.KAFKA_BROKERS,
    clientId: env.KAFKA_CLIENT_ID,
    groupId: env.KAFKA_GROUP_ID,
  });

  // Al componer, cada módulo registra sus handlers; luego arranca el consumidor.
  const modules = composeModules(mongoInfrastructure(), bus, {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    internalApiKey: env.INTERNAL_API_KEY,
    seatLockMinutes: env.SEAT_LOCK_MINUTES,
    maxActiveHoldsPerUser: env.MAX_ACTIVE_HOLDS_PER_USER,
    sweepPeriodMs: env.HOLD_EXPIRATION_SWEEP_MS,
  });
  await bus.start();
  modules.reservation.scheduler.start();

  const server = createHttpApp(modules, { corsOrigin: env.CORS_ORIGIN }).listen(env.PORT, () =>
    logger.info(`Monolito modular escuchando en http://localhost:${env.PORT}/api/v1 (bloqueo de asientos: ${env.SEAT_LOCK_MINUTES} min)`),
  );

  registerProcessHandlers('monolito', [
    () => modules.reservation.scheduler.stop(),
    () => new Promise((r) => server.close(r)),
    () => bus.stop(),
    () => disconnectMongo(),
  ]);
});
