import { Router } from 'express';
import { z } from 'zod';
import { businessDayRange, FlightStatus, updateFlightStatusSchema, UserRole } from '@reservas-vuelos/shared';
import {
  asyncHandler,
  ok,
  validate,
  validated,
  authenticate,
  authorize,
  JwtService,
  streamSse,
} from '@reservas-vuelos/service-kernel';
import { AirlineSyncUseCase, ChangeFlightStatusUseCase, FlightQueries, SyncFlightsUseCase } from '../../application/flight-management.use-cases';
import { DashboardService } from '../../application/dashboard.use-cases';
import { SyncLogRepository } from '../../domain/ports';

export interface RoutesDeps {
  jwt: JwtService;
  queries: FlightQueries;
  changeStatus: ChangeFlightStatusUseCase;
  syncFlights: SyncFlightsUseCase;
  airlineSync: AirlineSyncUseCase;
  dashboard: DashboardService;
  syncLog: SyncLogRepository;
}

const listQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.nativeEnum(FlightStatus).optional(),
  origin: z.string().length(3).toUpperCase().optional(),
  destination: z.string().length(3).toUpperCase().optional(),
});

const airlineFeed = z.object({
  updates: z
    .array(
      z.object({
        flightId: z.string(),
        status: z.nativeEnum(FlightStatus),
        delayMinutes: z.number().int().positive().optional(),
        reason: z.string().optional(),
      }),
    )
    .optional(),
});

function range(q: z.infer<typeof listQuery>) {
  if (q.date) return businessDayRange(q.date);
  return { from: q.from, to: q.to };
}

export function buildRoutes(d: RoutesDeps): Router {
  const r = Router();
  const admin = [authenticate(d.jwt), authorize(UserRole.ADMIN)];

  /* ----------------- Gestión avanzada de vuelos ----------------- */
  r.get(
    '/flights',
    validate(listQuery, 'query'),
    asyncHandler(async (req, res) => {
      const q = validated<typeof listQuery>(req, 'query');
      const flights = await d.queries.list({ ...range(q), status: q.status, origin: q.origin, destination: q.destination });
      ok(res, flights, 200, { count: flights.length });
    }),
  );

  r.get('/flights/:flightId', asyncHandler(async (req, res) => ok(res, await d.queries.get(req.params.flightId))));

  r.get('/flights/:flightId/status-history', asyncHandler(async (req, res) => ok(res, await d.queries.statusHistory(req.params.flightId))));

  /** Cambios de estado / retrasos / cancelaciones => evento FlightStatusChanged. */
  r.patch(
    '/flights/:flightId/status',
    ...admin,
    validate(updateFlightStatusSchema),
    asyncHandler(async (req, res) => {
      const body = validated<typeof updateFlightStatusSchema>(req);
      ok(res, await d.changeStatus.execute(req.params.flightId, body, req.user!.email));
    }),
  );

  /** Sincroniza el catálogo desde el monolito. */
  r.post('/flights/sync', ...admin, asyncHandler(async (_req, res) => ok(res, { synchronized: await d.syncFlights.execute() })));

  /** Sincronización con aerolíneas / GDS (feed opcional; vacío = simulación). */
  r.post(
    '/airlines/sync',
    ...admin,
    validate(airlineFeed),
    asyncHandler(async (req, res) => {
      const body = validated<typeof airlineFeed>(req);
      ok(res, await d.airlineSync.execute(body.updates));
    }),
  );

  r.get('/sync/log', ...admin, asyncHandler(async (_req, res) => ok(res, await d.syncLog.last(20))));

  /* ----------------- HU4: Dashboard en tiempo real ----------------- */
  r.get(
    '/dashboard/overview',
    asyncHandler(async (req, res) => {
      const hours = Math.min(Number(req.query.hoursAhead ?? 72) || 72, 24 * 15);
      ok(res, await d.dashboard.overview(hours));
    }),
  );

  r.get(
    '/dashboard/flights',
    validate(listQuery, 'query'),
    asyncHandler(async (req, res) => {
      const q = validated<typeof listQuery>(req, 'query');
      ok(res, await d.dashboard.listFlights(range(q)));
    }),
  );

  r.get('/dashboard/flights/:flightId/occupancy', asyncHandler(async (req, res) => ok(res, await d.dashboard.getOccupancy(req.params.flightId))));

  /** SSE: stream de ocupación de un vuelo (envía snapshot inicial + cada cambio). */
  r.get(
    '/dashboard/flights/:flightId/stream',
    asyncHandler(async (req, res) => {
      const snapshot = await d.dashboard.getOccupancy(req.params.flightId);
      streamSse(req, res, d.dashboard.stream(req.params.flightId));
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    }),
  );

  /** SSE: stream de ocupación de todos los vuelos. */
  r.get('/dashboard/stream', (req, res) => streamSse(req, res, d.dashboard.stream()));

  return r;
}
