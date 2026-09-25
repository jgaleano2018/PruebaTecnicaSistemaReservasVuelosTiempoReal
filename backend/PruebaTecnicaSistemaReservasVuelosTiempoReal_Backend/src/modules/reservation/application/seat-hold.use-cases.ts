import {
  EventTypes,
  FlightStatus,
  ReservationStatus,
  SeatHoldDto,
  SeatReleaseReason,
} from '@reservas-vuelos/shared';
import { Clock } from '../../../shared/application/clock.port';
import { EventBus } from '../../../shared/application/event-bus.port';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { isBookable } from '../../flight/domain/flight.entity';
import { Reservation } from '../domain/reservation.entities';
import { FlightReaderPort, ReservationRepository, SeatRepository } from '../domain/reservation.ports';

export interface SeatHoldConfig {
  lockMinutes: number;
  maxActiveHoldsPerUser: number;
}

export function toSeatHoldDto(r: Reservation): SeatHoldDto {
  return {
    holdId: r.id,
    reservationId: r.id,
    flightId: r.flightId,
    seatNumber: r.seatNumber,
    userId: r.userId,
    price: r.price,
    currency: r.currency,
    expiresAt: r.holdExpiresAt.toISOString(),
    status: r.status,
  };
}

/**
 * HU2: bloqueo temporal de un asiento (5-10 min).
 * Garantía anti double-booking: `SeatRepository.tryLock` es un compare-and-set atómico en MongoDB
 * (findOneAndUpdate condicionado a status AVAILABLE o bloqueo vencido).
 * Regla tiempo real: publica SeatLocked -> Kafka -> Realtime Gateway -> todos los clientes.
 */
export class CreateSeatHoldUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly reservations: ReservationRepository,
    private readonly flights: FlightReaderPort,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    private readonly config: SeatHoldConfig,
  ) {}

  async execute(input: { flightId: string; seatNumber: string; userId: string }): Promise<SeatHoldDto> {
    const now = this.clock.now();
    const seatNumber = input.seatNumber.toUpperCase();

    const flight = await this.flights.getFlight(input.flightId);
    if (!flight) throw new NotFoundError('Vuelo', input.flightId);
    if (!isBookable(flight, now)) {
      throw new ConflictError('FLIGHT_NOT_BOOKABLE', `El vuelo ${flight.flightNumber} no admite reservas (estado ${flight.status})`);
    }

    const seat = await this.seats.findOne(input.flightId, seatNumber);
    if (!seat) throw new NotFoundError('Asiento', `${input.flightId}/${seatNumber}`);

    // Idempotencia: si el mismo usuario ya tiene el bloqueo vigente, se devuelve el mismo.
    const existing = await this.reservations.findActiveHold(input.userId, input.flightId, seatNumber, now);
    if (existing) return toSeatHoldDto(existing);

    const active = await this.reservations.countActiveHolds(input.userId, input.flightId, now);
    if (active >= this.config.maxActiveHoldsPerUser) {
      throw new ConflictError('MAX_HOLDS_REACHED', `Máximo ${this.config.maxActiveHoldsPerUser} asientos bloqueados por vuelo`);
    }

    const reservationId = this.reservations.nextId();
    const expiresAt = new Date(now.getTime() + this.config.lockMinutes * 60_000);

    const locked = await this.seats.tryLock({
      flightId: input.flightId,
      seatNumber,
      reservationId,
      userId: input.userId,
      expiresAt,
      now,
    });
    if (!locked) {
      throw new ConflictError('SEAT_NOT_AVAILABLE', `El asiento ${seatNumber} ya fue bloqueado u ocupado por otro usuario`);
    }

    let reservation: Reservation;
    try {
      reservation = await this.reservations.create({
        id: reservationId,
        flightId: input.flightId,
        flightNumber: flight.flightNumber,
        seatNumber,
        cabinClass: seat.cabinClass,
        userId: input.userId,
        status: ReservationStatus.PENDING_PAYMENT,
        price: seat.price,
        currency: seat.currency,
        holdExpiresAt: expiresAt,
        createdAt: now,
      });
    } catch (err) {
      await this.seats.releaseLock(input.flightId, seatNumber, reservationId); // compensación
      throw err;
    }

    await this.bus.publish(EventTypes.SeatLocked, input.flightId, {
      flightId: input.flightId,
      seatNumber,
      reservationId,
      userId: input.userId,
      price: seat.price,
      currency: seat.currency,
      expiresAt: expiresAt.toISOString(),
    });

    return toSeatHoldDto(reservation);
  }
}

/** El usuario libera voluntariamente su bloqueo. */
export class ReleaseSeatHoldUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly reservations: ReservationRepository,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(reservationId: string, userId: string, isAdmin = false): Promise<SeatHoldDto> {
    const current = await this.reservations.findById(reservationId);
    if (!current) throw new NotFoundError('Reserva', reservationId);
    if (!isAdmin && current.userId !== userId) throw new ForbiddenError();

    const updated = await this.reservations.transition(reservationId, [ReservationStatus.PENDING_PAYMENT], {
      status: ReservationStatus.CANCELLED,
      cancelledAt: this.clock.now(),
    });
    if (!updated) throw new ConflictError('HOLD_NOT_ACTIVE', 'El bloqueo ya no está activo');

    const released = await this.seats.releaseLock(current.flightId, current.seatNumber, reservationId);
    if (released) {
      await this.bus.publish(EventTypes.SeatReleased, current.flightId, {
        flightId: current.flightId,
        seatNumber: current.seatNumber,
        reservationId,
        reason: SeatReleaseReason.USER_CANCELLED,
      });
    }
    return toSeatHoldDto(updated);
  }
}

/**
 * Liberación por tiempo expirado. Se ejecuta periódicamente (stream RxJS `interval`).
 * Es seguro con varias instancias: la liberación es condicional y atómica.
 */
export class ExpireSeatHoldsUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly reservations: ReservationRepository,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(batchSize = 200): Promise<number> {
    const now = this.clock.now();
    const expired = await this.seats.findExpiredLocks(now, batchSize);
    let count = 0;
    for (const seat of expired) {
      const reservationId = seat.lockedByReservationId;
      if (!reservationId) continue;
      const released = await this.seats.releaseExpiredLock(seat.flightId, seat.seatNumber, reservationId, now);
      if (!released) continue;
      await this.reservations.transition(reservationId, [ReservationStatus.PENDING_PAYMENT], {
        status: ReservationStatus.EXPIRED,
      });
      await this.bus.publish(EventTypes.SeatReleased, seat.flightId, {
        flightId: seat.flightId,
        seatNumber: seat.seatNumber,
        reservationId,
        reason: SeatReleaseReason.EXPIRED,
      });
      count++;
    }
    await this.reservations.expireStalePending(now);
    return count;
  }
}

/** Al cancelarse un vuelo se liberan los bloqueos pendientes (las reservas pagadas se reembolsan en Payment Service). */
export class ReleaseHoldsOnFlightCancelledUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly reservations: ReservationRepository,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(flightId: string, newStatus: FlightStatus): Promise<number> {
    if (newStatus !== FlightStatus.CANCELLED) return 0;
    const pending = await this.reservations.findPendingByFlight(flightId);
    let count = 0;
    for (const r of pending) {
      const updated = await this.reservations.transition(r.id, [ReservationStatus.PENDING_PAYMENT], {
        status: ReservationStatus.CANCELLED,
        cancelledAt: this.clock.now(),
        failureReason: 'Vuelo cancelado',
      });
      if (!updated) continue;
      if (await this.seats.releaseLock(r.flightId, r.seatNumber, r.id)) {
        await this.bus.publish(EventTypes.SeatReleased, flightId, {
          flightId,
          seatNumber: r.seatNumber,
          reservationId: r.id,
          reason: SeatReleaseReason.FLIGHT_CANCELLED,
        });
        count++;
      }
    }
    return count;
  }
}
