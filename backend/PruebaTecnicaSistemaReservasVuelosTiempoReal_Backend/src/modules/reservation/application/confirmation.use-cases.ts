import {
  EventTypes,
  PaymentProcessedPayload,
  PaymentRefundedPayload,
  PaymentStatus,
  ReservationStatus,
  SeatReleaseReason,
} from '@reservas-vuelos/shared';
import { Clock } from '../../../shared/application/clock.port';
import { EventBus } from '../../../shared/application/event-bus.port';
import { logger } from '../../../shared/infrastructure/logging/logger';
import { generateReservationCode, Reservation } from '../domain/reservation.entities';
import { CustomerRegistryPort, ReservationRepository, SeatRepository } from '../domain/reservation.ports';

export type ConfirmationResult =
  | { outcome: 'CONFIRMED'; reservation: Reservation }
  | { outcome: 'ALREADY_CONFIRMED'; reservation: Reservation }
  | { outcome: 'FAILED'; reason: string }
  | { outcome: 'IGNORED'; reason: string };

/**
 * HU3: consume PaymentProcessed (Payment Service). Si el pago fue aprobado:
 *  1. El asiento pasa a OCCUPIED de forma permanente (compare-and-set).
 *  2. Se registra/actualiza el cliente (módulo Clientes).
 *  3. La reserva pasa a CONFIRMED con código único (PNR).
 *  4. Se emite ReservationConfirmed -> Realtime Gateway deshabilita el asiento para todos.
 * Si el asiento se perdió (bloqueo vencido y tomado por otro) se emite ReservationFailed
 * y el Payment Service reembolsa automáticamente (saga con compensación).
 */
export class ConfirmReservationUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly reservations: ReservationRepository,
    private readonly customers: CustomerRegistryPort,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(payment: PaymentProcessedPayload): Promise<ConfirmationResult> {
    if (payment.status !== PaymentStatus.APPROVED) {
      return { outcome: 'IGNORED', reason: 'Pago rechazado; el bloqueo sigue vigente hasta su expiración' };
    }

    const reservation = await this.reservations.findById(payment.reservationId);
    if (!reservation) return this.fail(payment, 'La reserva no existe');

    if (reservation.status === ReservationStatus.CONFIRMED) {
      if (reservation.paymentId === payment.paymentId) return { outcome: 'ALREADY_CONFIRMED', reservation };
      return this.fail(payment, 'La reserva ya fue pagada con otro pago');
    }
    if (![ReservationStatus.PENDING_PAYMENT, ReservationStatus.EXPIRED].includes(reservation.status)) {
      return this.fail(payment, `La reserva está en estado ${reservation.status}`);
    }

    const now = this.clock.now();
    const seat = await this.seats.occupy(reservation.flightId, reservation.seatNumber, reservation.id, now);
    if (!seat) {
      await this.reservations.transition(reservation.id, [ReservationStatus.PENDING_PAYMENT, ReservationStatus.EXPIRED], {
        status: ReservationStatus.FAILED,
        failureReason: 'El asiento ya no estaba disponible al confirmar el pago',
        paymentId: payment.paymentId,
      });
      return this.fail(payment, 'El asiento ya no estaba disponible al confirmar el pago');
    }

    const { customerId } = await this.customers.registerPassenger(payment.passenger, reservation.userId);

    let confirmed: Reservation | null = null;
    for (let attempt = 0; attempt < 5 && !confirmed; attempt++) {
      try {
        confirmed = await this.reservations.transition(
          reservation.id,
          [ReservationStatus.PENDING_PAYMENT, ReservationStatus.EXPIRED],
          {
            status: ReservationStatus.CONFIRMED,
            reservationCode: generateReservationCode(),
            paymentId: payment.paymentId,
            customerId,
            passenger: payment.passenger,
            confirmedAt: now,
          },
        );
        if (!confirmed) break;
      } catch (err: any) {
        if (err?.code !== 11000) throw err; // 11000 = colisión del índice único del código; se reintenta
      }
    }
    if (!confirmed) {
      const latest = await this.reservations.findById(reservation.id);
      if (latest?.status === ReservationStatus.CONFIRMED) return { outcome: 'ALREADY_CONFIRMED', reservation: latest };
      return this.fail(payment, 'No fue posible confirmar la reserva');
    }

    await this.customers.incrementReservations(customerId);

    await this.bus.publish(EventTypes.ReservationConfirmed, confirmed.flightId, {
      reservationId: confirmed.id,
      reservationCode: confirmed.reservationCode!,
      flightId: confirmed.flightId,
      flightNumber: confirmed.flightNumber,
      seatNumber: confirmed.seatNumber,
      userId: confirmed.userId,
      customerId,
      paymentId: payment.paymentId,
      price: confirmed.price,
      currency: confirmed.currency,
      confirmedAt: now.toISOString(),
    });

    return { outcome: 'CONFIRMED', reservation: confirmed };
  }

  private async fail(payment: PaymentProcessedPayload, reason: string): Promise<ConfirmationResult> {
    logger.warn({ reservationId: payment.reservationId, paymentId: payment.paymentId, reason }, 'Reserva no confirmada');
    await this.bus.publish(EventTypes.ReservationFailed, payment.flightId, {
      reservationId: payment.reservationId,
      paymentId: payment.paymentId,
      flightId: payment.flightId,
      seatNumber: payment.seatNumber,
      reason,
    });
    return { outcome: 'FAILED', reason };
  }
}

/** Consume PaymentRefunded: cancela la reserva confirmada y libera el asiento. */
export class CancelReservationOnRefundUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly reservations: ReservationRepository,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(refund: PaymentRefundedPayload): Promise<boolean> {
    const updated = await this.reservations.transition(refund.reservationId, [ReservationStatus.CONFIRMED], {
      status: ReservationStatus.CANCELLED,
      cancelledAt: this.clock.now(),
      failureReason: `Reembolso: ${refund.reason}`,
    });
    if (!updated) return false;
    const released = await this.seats.releaseOccupied(updated.flightId, updated.seatNumber, updated.id);
    if (released) {
      await this.bus.publish(EventTypes.SeatReleased, updated.flightId, {
        flightId: updated.flightId,
        seatNumber: updated.seatNumber,
        reservationId: updated.id,
        reason: SeatReleaseReason.PAYMENT_REFUNDED,
      });
    }
    return true;
  }
}
