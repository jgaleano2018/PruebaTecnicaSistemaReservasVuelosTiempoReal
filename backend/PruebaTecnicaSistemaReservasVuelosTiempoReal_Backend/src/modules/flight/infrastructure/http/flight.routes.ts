import { Router } from 'express';
import { z } from 'zod';
import { flightSearchQuerySchema } from '@reservas-vuelos/shared';
import { asyncHandler, ok, validate, validated, internalOnly } from '@reservas-vuelos/service-kernel';
import {
  GetCatalogUseCase,
  GetFlightUseCase,
  ListFlightsForSyncUseCase,
  SearchFlightsUseCase,
} from '../../application/flight.use-cases';

export interface FlightHttpDeps {
  searchFlights: SearchFlightsUseCase;
  getFlight: GetFlightUseCase;
  listForSync: ListFlightsForSyncUseCase;
  catalog: GetCatalogUseCase;
  internalApiKey: string;
}

const syncQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function buildFlightRouter(d: FlightHttpDeps): Router {
  const r = Router();

  /**
   * HU1 - GET /api/v1/flights/search?origin=BOG&destination=MDE&date=2026-09-25
   * Regla tiempo real: los cambios de estado llegan por WebSocket (Realtime Gateway, sala `flights:list`).
   */
  r.get(
    '/flights/search',
    validate(flightSearchQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const query = validated<typeof flightSearchQuerySchema>(req, 'query');
      const flights = await d.searchFlights.execute(query);
      ok(res, flights, 200, {
        count: flights.length,
        realtime: { transport: 'socket.io', event: 'flight:status-changed', subscribe: 'subscribe:flights' },
      });
    }),
  );

  r.get(
    '/flights/:flightId',
    asyncHandler(async (req, res) => {
      ok(res, await d.getFlight.execute(req.params.flightId));
    }),
  );

  r.get('/airports', asyncHandler(async (_req, res) => ok(res, await d.catalog.airports())));
  r.get('/routes', asyncHandler(async (_req, res) => ok(res, await d.catalog.routes())));
  r.get('/aircraft', asyncHandler(async (_req, res) => ok(res, await d.catalog.aircraft())));

  /** Endpoint interno: sincronización del Flight Management Service. */
  r.get(
    '/internal/flights',
    internalOnly(d.internalApiKey),
    validate(syncQuery, 'query'),
    asyncHandler(async (req, res) => {
      const q = validated<typeof syncQuery>(req, 'query');
      const from = q.from ?? new Date(Date.now() - 24 * 3600 * 1000);
      const to = q.to ?? new Date(Date.now() + 60 * 24 * 3600 * 1000);
      ok(res, await d.listForSync.execute(from, to));
    }),
  );

  return r;
}
