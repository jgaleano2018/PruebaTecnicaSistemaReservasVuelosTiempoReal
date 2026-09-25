import { Router } from 'express';
import { Clock } from '../../shared/application/clock.port';
import { EventBus } from '../../shared/application/event-bus.port';
import { JwtService } from '../../shared/infrastructure/auth/jwt';
import { CancelReservationOnRefundUseCase, ConfirmReservationUseCase } from './application/confirmation.use-cases';
import { GetReservationUseCase, GetTicketUseCase, ListMyReservationsUseCase } from './application/reservation-query.use-cases';
import {
  CreateSeatHoldUseCase,
  ExpireSeatHoldsUseCase,
  ReleaseHoldsOnFlightCancelledUseCase,
  ReleaseSeatHoldUseCase,
  SeatHoldConfig,
} from './application/seat-hold.use-cases';
import { GetSeatMapUseCase, GetSeatStatesUseCase, GetSeatUseCase, SeatAvailabilityService } from './application/seat-map.use-cases';
import { CustomerRegistryPort, FlightReaderPort, ReservationRepository, SeatRepository } from './domain/reservation.ports';
import { buildReservationRouter } from './infrastructure/http/reservation.routes';
import { registerReservationEventConsumers } from './infrastructure/messaging/reservation-events.consumer';
import { HoldExpirationScheduler } from './infrastructure/scheduling/hold-expiration.scheduler';

export interface ReservationModuleDeps {
  seats: SeatRepository;
  reservations: ReservationRepository;
  flights: FlightReaderPort;
  customers: CustomerRegistryPort;
  bus: EventBus;
  clock: Clock;
  jwt: JwtService;
  internalApiKey: string;
  holdConfig: SeatHoldConfig;
  sweepPeriodMs: number;
}

/**
 * Módulo de Reservas (Reservation): mapa de asientos, bloqueo temporal, confirmación,
 * procesamiento de pago (vía eventos del Payment Service) y generación del ticket.
 */
export function createReservationModule(d: ReservationModuleDeps) {
  const createHold = new CreateSeatHoldUseCase(d.seats, d.reservations, d.flights, d.bus, d.clock, d.holdConfig);
  const releaseHold = new ReleaseSeatHoldUseCase(d.seats, d.reservations, d.bus, d.clock);
  const expireHolds = new ExpireSeatHoldsUseCase(d.seats, d.reservations, d.bus, d.clock);
  const confirm = new ConfirmReservationUseCase(d.seats, d.reservations, d.customers, d.bus, d.clock);
  const cancelOnRefund = new CancelReservationOnRefundUseCase(d.seats, d.reservations, d.bus, d.clock);
  const releaseOnCancel = new ReleaseHoldsOnFlightCancelledUseCase(d.seats, d.reservations, d.bus, d.clock);

  registerReservationEventConsumers(d.bus, confirm, cancelOnRefund, releaseOnCancel);

  const router: Router = buildReservationRouter({
    jwt: d.jwt,
    internalApiKey: d.internalApiKey,
    getSeatMap: new GetSeatMapUseCase(d.seats, d.flights, d.clock),
    getSeat: new GetSeatUseCase(d.seats, d.clock),
    getSeatStates: new GetSeatStatesUseCase(d.seats, d.clock),
    createHold,
    releaseHold,
    getReservation: new GetReservationUseCase(d.reservations),
    listMine: new ListMyReservationsUseCase(d.reservations),
    getTicket: new GetTicketUseCase(d.reservations, d.flights),
  });

  const scheduler = new HoldExpirationScheduler(expireHolds, d.sweepPeriodMs);

  return {
    router,
    scheduler,
    api: {
      seatAvailability: new SeatAvailabilityService(d.seats, d.clock),
      createHold,
      expireHolds,
      confirm,
    },
  };
}
