import { createServer } from 'http';
import { env } from './config/env';
import { createHttpApp } from './app';
import { logger } from './shared/infrastructure/logging/logger';
import { KafkaEventBus } from './shared/infrastructure/messaging/kafka-event-bus';
import { InMemoryEventBus } from './shared/infrastructure/messaging/in-memory-event-bus';
import { EventBus } from './shared/application/event-bus.port';
import { JwtService } from './shared/infrastructure/auth/jwt';
import { RealtimeGatewayService } from './application/realtime-gateway.service';
import { attachSocketServer } from './infrastructure/websocket/socket-server';
import { buildRoutes } from './infrastructure/http/routes';

async function bootstrap() {
  const bus: EventBus =
    env.EVENT_BUS === 'kafka'
      ? new KafkaEventBus({
          clientId: `${env.KAFKA_CLIENT_ID}-${env.INSTANCE_ID}`,
          brokers: env.KAFKA_BROKERS.split(','),
          groupId: `${env.KAFKA_GROUP_PREFIX}-${env.INSTANCE_ID}`,
          source: 'realtime-gateway',
          logger,
          subscribeAll: true,
          fromBeginning: false,
        })
      : new InMemoryEventBus('realtime-gateway', undefined, true);

  const gateway = new RealtimeGatewayService(bus.events$, env.INSTANCE_ID);
  const app = createHttpApp(buildRoutes(gateway), { corsOrigin: env.CORS_ORIGIN });
  const httpServer = createServer(app);
  const { io, subscription } = attachSocketServer(httpServer, gateway, new JwtService(env.JWT_SECRET, '8h'), {
    corsOrigin: env.CORS_ORIGIN,
    maxSubscriptions: env.MAX_SUBSCRIPTIONS_PER_SOCKET,
  });

  await bus.start();
  httpServer.listen(env.PORT, () => logger.info({ instanceId: env.INSTANCE_ID }, `Realtime Gateway (Socket.io + SSE) en :${env.PORT}`));

  const shutdown = async () => {
    subscription.unsubscribe();
    io.close();
    await bus.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'No fue posible iniciar el Realtime Gateway');
  process.exit(1);
});
