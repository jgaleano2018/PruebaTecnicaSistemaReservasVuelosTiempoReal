import { Router } from 'express';
import { map } from 'rxjs';
import { Rooms } from '@reservas-vuelos/shared';
import { ok } from '../../shared/infrastructure/http/http-utils';
import { streamSse } from '../../shared/infrastructure/http/sse';
import { RealtimeGatewayService } from '../../application/realtime-gateway.service';

/** Transporte alterno SSE (Server-Sent Events) para clientes que no usan WebSocket. */
export function buildRoutes(gateway: RealtimeGatewayService): Router {
  const r = Router();

  const sse = (room: (id: string) => string) => (req: any, res: any) => {
    gateway.stats.sseClients++;
    req.on('close', () => gateway.stats.sseClients--);
    streamSse(req, res, gateway.forRoom(room(req.params.id)).pipe(map((d) => ({ event: d.event, data: d.data }))));
  };

  r.get('/sse/flights', sse(() => Rooms.flightsList()));
  r.get('/sse/flights/:id', sse((id) => Rooms.flight(id)));
  r.get('/sse/dashboard/:id', sse((id) => (id === 'all' ? Rooms.dashboardAll() : Rooms.dashboard(id))));

  r.get('/gateway/stats', (_req, res) => ok(res, gateway.stats));
  r.get('/gateway/protocol', (_req, res) =>
    ok(res, {
      websocket: {
        url: 'ws://<host>:4000 (Socket.io)',
        auth: 'handshake.auth.token = JWT (opcional)',
        clientEvents: ['subscribe:flight', 'unsubscribe:flight', 'subscribe:flights', 'unsubscribe:flights', 'subscribe:dashboard', 'unsubscribe:dashboard', 'subscribe:reservation'],
        serverEvents: ['seat:locked', 'seat:released', 'seat:occupied', 'flight:status-changed', 'reservation:confirmed', 'reservation:failed', 'payment:processed', 'dashboard:occupancy'],
      },
      sse: ['/api/v1/sse/flights', '/api/v1/sse/flights/:flightId', '/api/v1/sse/dashboard/:flightId|all'],
    }),
  );
  return r;
}
