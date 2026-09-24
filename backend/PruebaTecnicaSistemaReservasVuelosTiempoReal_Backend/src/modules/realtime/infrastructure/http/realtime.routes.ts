import { Router } from 'express';
import { firstValueFrom } from 'rxjs';
import { EventType, EventTypes } from '@reservas-vuelos/shared';
import { ok, streamSse } from '@reservas-vuelos/service-kernel';
import { RealtimeHub } from '../../application/realtime-hub';

export function buildRealtimeRouter(hub: RealtimeHub, subscriptions: string[]): Router {
  const r = Router();

  /** SSE de respaldo: GET /api/v1/realtime/events?flightId=...&types=SeatLocked,SeatReleased */
  r.get('/realtime/events', (req, res) => {
    const flightId = typeof req.query.flightId === 'string' ? req.query.flightId : undefined;
    const types =
      typeof req.query.types === 'string'
        ? (req.query.types.split(',').filter((t) => t in EventTypes) as EventType[])
        : undefined;
    streamSse(req, res, hub.stream({ flightId, types }));
  });

  r.get('/realtime/status', async (_req, res) => {
    ok(res, {
      consumes: subscriptions,
      publishes: ['SeatLocked', 'SeatReleased', 'ReservationConfirmed', 'ReservationFailed'],
      stats: await firstValueFrom(hub.stats$),
      gateway: 'Broadcast WebSocket/SSE a clientes: microservicio Realtime Gateway',
    });
  });
  return r;
}
