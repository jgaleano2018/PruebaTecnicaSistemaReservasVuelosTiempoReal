import { env } from './config/env';
import { createHttpApp } from './app';
import { compose } from './container';
import { connectMongo, disconnectMongo } from './shared/infrastructure/database/mongo';
import { logger } from './shared/infrastructure/logging/logger';
import { KafkaEventBus } from './shared/infrastructure/messaging/kafka-event-bus';
import { InMemoryEventBus } from './shared/infrastructure/messaging/in-memory-event-bus';
import { EventBus } from './shared/application/event-bus.port';
import {
  MongoPaymentIntentRepository,
  MongoPaymentRepository,
  MongoRefundRepository,
  PAYMENT_DB_COLLECTIONS,
} from './infrastructure/persistence/mongo.repositories';
import { FakePaymentGateway } from './infrastructure/gateway/fake-payment.gateway';
import { HttpReservationHoldClient } from './infrastructure/clients/reservation-hold.client';

async function bootstrap() {
  await connectMongo(env.MONGO_URI);
  for (const model of PAYMENT_DB_COLLECTIONS) {
    await model.createCollection().catch(() => undefined);
    await model.syncIndexes();
  }

  const bus: EventBus =
    env.EVENT_BUS === 'kafka'
      ? new KafkaEventBus({
          clientId: env.KAFKA_CLIENT_ID,
          brokers: env.KAFKA_BROKERS.split(','),
          groupId: env.KAFKA_GROUP_ID,
          source: 'payment-service',
          logger,
        })
      : new InMemoryEventBus('payment-service');

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
  const app = createHttpApp(c.router, { corsOrigin: env.CORS_ORIGIN, service: 'payment-service' });
  const server = app.listen(env.PORT, () => logger.info(`Payment Service en http://localhost:${env.PORT}/api/v1`));

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
  logger.fatal({ err }, 'No fue posible iniciar el Payment Service');
  process.exit(1);
});
