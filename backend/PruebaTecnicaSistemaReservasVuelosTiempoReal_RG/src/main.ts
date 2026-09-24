import { createServer } from 'http';
import { env } from './config/env';
import { createEventBus, JwtService, logger, registerProcessHandlers, runService } from '@reservas-vuelos/service-kernel';
import { createHttpApp } from './app';
import { RealtimeGatewayService } from './application/realtime-gateway.service';
import { attachSocketServer } from './infrastructure/websocket/socket-server';
import { buildRoutes } from './infrastructure/http/routes';

const SERVICE = 'realtime-gateway';

runService(SERVICE, async () => {
  // Grupo de consumo propio por instancia => cada réplica recibe TODOS los eventos (fan-out / escalado horizontal)
  const bus = createEventBus({
    kind: env.EVENT_BUS,
    source: SERVICE,
    brokers: env.KAFKA_BROKERS,
    clientId: `${env.KAFKA_CLIENT_ID}-${env.INSTANCE_ID}`,
    groupId: `${env.KAFKA_GROUP_PREFIX}-${env.INSTANCE_ID}`,
    subscribeAll: true,
    fromBeginning: false,
  });

  const gateway = new RealtimeGatewayService(bus.events$, env.INSTANCE_ID);
  const httpServer = createServer(createHttpApp(buildRoutes(gateway), { corsOrigin: env.CORS_ORIGIN }));
  const { io, subscription } = attachSocketServer(httpServer, gateway, new JwtService(env.JWT_SECRET, '8h'), {
    corsOrigin: env.CORS_ORIGIN,
    maxSubscriptions: env.MAX_SUBSCRIPTIONS_PER_SOCKET,
  });

  await bus.start();
  httpServer.listen(env.PORT, () => logger.info({ instanceId: env.INSTANCE_ID }, `Realtime Gateway (Socket.io + SSE) en :${env.PORT}`));

  registerProcessHandlers(SERVICE, [() => subscription.unsubscribe(), () => new Promise((r) => io.close(() => r(undefined))), () => bus.stop()]);
});
