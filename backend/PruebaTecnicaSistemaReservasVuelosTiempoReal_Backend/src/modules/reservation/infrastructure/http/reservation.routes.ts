import { Router } from 'express';
import { createSeatHoldSchema, UserRole } from '@reservas-vuelos/shared';
import {
  asyncHandler,
  ok,
  validate,
  validated,
  authenticate,
  authorize,
  internalOnly,
  JwtService,
  optionalAuth,
} from '@reservas-vuelos/service-kernel';
import { GetSeatMapUseCase, GetSeatStatesUseCase, GetSeatUseCase } from '../../application/seat-map.use-cases';
import { CreateSeatHoldUseCase, ReleaseSeatHoldUseCase } from '../../application/seat-hold.use-cases';
import { GetReservationUseCase, GetTicketUseCase, ListMyReservationsUseCase } from '../../application/reservation-query.use-cases';

export interface ReservationHttpDeps {
  jwt: JwtService;
  internalApiKey: string;
  getSeatMap: GetSeatMapUseCase;
  getSeat: GetSeatUseCase;
  getSeatStates: GetSeatStatesUseCase;
  createHold: CreateSeatHoldUseCase;
  releaseHold: ReleaseSeatHoldUseCase;
  getReservation: GetReservationUseCase;
  listMine: ListMyReservationsUseCase;
  getTicket: GetTicketUseCase;
}

export function buildReservationRouter(d: ReservationHttpDeps): Router {
  const r = Router();
  const auth = authenticate(d.jwt);
  const customerOrAdmin = authorize(UserRole.CUSTOMER, UserRole.ADMIN);

  /** HU2 - mapa interactivo completo de la aeronave. */
  r.get(
    '/flights/:flightId/seats',
    optionalAuth(d.jwt),
    asyncHandler(async (req, res) => {
      ok(res, await d.getSeatMap.execute(req.params.flightId, req.user?.sub), 200, {
        realtime: { transport: 'socket.io', subscribe: 'subscribe:flight', events: ['seat:locked', 'seat:released', 'seat:occupied'] },
      });
    }),
  );

  /** HU2 - Endpoint 1: información de un asiento del mapa (monolito modular). */
  r.get(
    '/flights/:flightId/seats/:seatNumber',
    optionalAuth(d.jwt),
    asyncHandler(async (req, res) => {
      ok(res, await d.getSeat.execute(req.params.flightId, req.params.seatNumber, req.user?.sub));
    }),
  );

  /**
   * Bloqueo temporal del asiento (lo invoca el Payment Service en POST /api/v1/checkout/holds
   * reenviando el JWT del cliente; también puede usarse directamente).
   */
  r.post(
    '/reservations/holds',
    auth,
    customerOrAdmin,
    validate(createSeatHoldSchema),
    asyncHandler(async (req, res) => {
      const body = validated<typeof createSeatHoldSchema>(req);
      const hold = await d.createHold.execute({ ...body, userId: req.user!.sub });
      ok(res, hold, 201);
    }),
  );

  r.delete(
    '/reservations/holds/:reservationId',
    auth,
    customerOrAdmin,
    asyncHandler(async (req, res) => {
      ok(res, await d.releaseHold.execute(req.params.reservationId, req.user!.sub, req.user!.role === UserRole.ADMIN));
    }),
  );

  r.get(
    '/reservations/me',
    auth,
    asyncHandler(async (req, res) => ok(res, await d.listMine.execute(req.user!.sub))),
  );

  r.get(
    '/reservations/:reservationId',
    auth,
    asyncHandler(async (req, res) => ok(res, await d.getReservation.execute(req.params.reservationId, req.user!))),
  );

  /** HU3 - boleto con código de reserva único. */
  r.get(
    '/reservations/:reservationId/ticket',
    auth,
    asyncHandler(async (req, res) => ok(res, await d.getTicket.byId(req.params.reservationId, req.user!))),
  );

  r.get(
    '/tickets/:reservationCode',
    auth,
    asyncHandler(async (req, res) => ok(res, await d.getTicket.byCode(req.params.reservationCode, req.user!))),
  );

  /** Interno: estado de todos los asientos (proyección inicial del Flight Management Service). */
  r.get(
    '/internal/flights/:flightId/seats',
    internalOnly(d.internalApiKey),
    asyncHandler(async (req, res) => ok(res, await d.getSeatStates.execute(req.params.flightId))),
  );

  return r;
}
