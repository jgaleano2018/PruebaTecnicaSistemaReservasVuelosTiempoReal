import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import {
  ClientSocketEvents,
  ClientToServerEvents,
  JwtPayloadDto,
  Rooms,
  ServerSocketEvents,
  ServerToClientEvents,
} from '@reservas-vuelos/shared';
import { JwtService, logger } from '@reservas-vuelos/service-kernel';
import { RealtimeGatewayService } from '../../application/realtime-gateway.service';

type GatewaySocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { user?: JwtPayloadDto; subs: number }>;

/**
 * Transporte WebSocket (Socket.io): gestión de conexiones, suscripción a salas y distribución de eventos.
 * Escalabilidad horizontal: cada instancia consume TODOS los eventos de Kafka (grupo propio)
 * y emite solo a sus sockets locales, por lo que se pueden agregar réplicas detrás de un balanceador
 * con sticky sessions sin necesidad de un adapter compartido.
 */
export function attachSocketServer(
  httpServer: HttpServer,
  gateway: RealtimeGatewayService,
  jwt: JwtService,
  opts: { corsOrigin: string; maxSubscriptions: number },
): { io: Server; subscription: Subscription } {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: opts.corsOrigin === '*' ? true : opts.corsOrigin.split(','), credentials: true },
    transports: ['websocket', 'polling'],
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  // Autenticación opcional en el handshake (auth.token o query.token); sin token = invitado (solo lectura pública)
  io.use((socket, next) => {
    const s = socket as GatewaySocket;
    s.data.subs = 0;
    const token = (socket.handshake.auth?.token as string) ?? (socket.handshake.query?.token as string);
    if (token) {
      try {
        s.data.user = jwt.verify(token);
      } catch {
        return next(new Error('Token inválido'));
      }
    }
    next();
  });

  io.on('connection', (raw) => {
    const socket = raw as GatewaySocket;
    gateway.stats.connections++;
    const user = socket.data.user;
    if (user) void socket.join(Rooms.user(user.sub));
    socket.emit(ServerSocketEvents.Connected, { socketId: socket.id, instanceId: gateway.stats.instanceId });

    const join = (room: string, ack?: (r: { ok: boolean; room: string }) => void) => {
      if (socket.data.subs >= opts.maxSubscriptions) return ack?.({ ok: false, room });
      socket.data.subs++;
      void socket.join(room);
      ack?.({ ok: true, room });
    };
    const leave = (room: string) => {
      if (socket.rooms.has(room)) socket.data.subs--;
      void socket.leave(room);
    };

    socket.on(ClientSocketEvents.SubscribeFlight, (flightId, ack) => join(Rooms.flight(String(flightId)), ack));
    socket.on(ClientSocketEvents.UnsubscribeFlight, (flightId) => leave(Rooms.flight(String(flightId))));
    socket.on(ClientSocketEvents.SubscribeFlightsList, (ack) => join(Rooms.flightsList(), ack));
    socket.on(ClientSocketEvents.UnsubscribeFlightsList, () => leave(Rooms.flightsList()));
    socket.on(ClientSocketEvents.SubscribeDashboard, (flightId, ack) =>
      join(flightId === 'all' ? Rooms.dashboardAll() : Rooms.dashboard(String(flightId)), ack),
    );
    socket.on(ClientSocketEvents.UnsubscribeDashboard, (flightId) =>
      leave(flightId === 'all' ? Rooms.dashboardAll() : Rooms.dashboard(String(flightId))),
    );
    // Solo el dueño (o un admin) puede seguir una reserva; se valida al recibir por userId en la sala user:*
    socket.on(ClientSocketEvents.SubscribeReservation, (reservationId, ack) => {
      if (!user) return ack?.({ ok: false, room: Rooms.reservation(String(reservationId)) });
      join(Rooms.reservation(String(reservationId)), ack);
    });

    socket.on('disconnect', (reason) => {
      gateway.stats.connections--;
      logger.debug({ socketId: socket.id, reason }, 'Socket desconectado');
    });
  });

  const subscription = gateway.dispatches$.subscribe((d) => {
    gateway.stats.dispatches++;
    io.to(d.rooms).emit(d.event as keyof ServerToClientEvents, d.data as never);
  });

  return { io, subscription };
}
