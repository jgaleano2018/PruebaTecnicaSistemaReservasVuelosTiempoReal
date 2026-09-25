import { env } from './config/env';
import { createEventBus, logger, registerProcessHandlers, runService } from '@reservas-vuelos/service-kernel';
import { connectMongo, disconnectMongo, ensureCollections } from '@reservas-vuelos/service-kernel/database';
import { createHttpApp } from './app';
import { compose } from './container';
import {
  MongoPaymentIntentRepository,
  MongoPaymentRepository,
  MongoRefundRepository,
  PAYMENT_DB_COLLECTIONS,
} from './infrastructure/persistence/mongo.repositories';
import { FakePaymentGateway } from './infrastructure/gateway/fake-payment.gateway';
import { HttpReservationHoldClient } from './infrastructure/clients/reservation-hold.client';

const SERVICE = 'payment-service';

runService(SERVICE, async () => {
  await connectMongo(env.MONGO_URI);
  await ensureCollections(PAYMENT_DB_COLLECTIONS);

  const bus = createEventBus({
    kind: env.EVENT_BUS,
    source: SERVICE,
    brokers: env.KAFKA_BROKERS,
    clientId: env.KAFKA_CLIENT_ID,
    groupId: env.KAFKA_GROUP_ID,
  });

  const c = compose(
    {
      intents: new MongoPaymentIntentRepository(),
      payments: new MongoPaymentRepository(),
      refunds: new MongoRefundRepository(),
      gateway: new FakePaymentGateway(env.GATEWAY_LATENCY_MS),
      holds: new HttpReservationHoldClient(env.MONOLITH_URL),
    },
    bus,
    { jwtSecret: env.JWT_SECRET, jwtExpiresIn: env.JWT_EXPIRES_IN },
  );
  await bus.start();

  const server = createHttpApp(c.router, { corsOrigin: env.CORS_ORIGIN, service: SERVICE }).listen(env.PORT, () =>
    logger.info(`Payment Service en http://localhost:${env.PORT}/api/v1`),
  );

  registerProcessHandlers(SERVICE, [() => new Promise((r) => server.close(r)), () => bus.stop(), () => disconnectMongo()]);
});
