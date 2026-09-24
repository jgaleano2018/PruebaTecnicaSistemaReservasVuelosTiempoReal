import { EventTypes } from '@reservas-vuelos/shared';
import { EventBus } from '../../../../shared/application/event-bus.port';
import { logger } from '../../../../shared/infrastructure/logging/logger';
import { CancelReservationOnRefundUseCase, ConfirmReservationUseCase } from '../../application/confirmation.use-cases';
import { ReleaseHoldsOnFlightCancelledUseCase } from '../../application/seat-hold.use-cases';

/** Adaptadores de entrada Kafka del módulo de Reservas. */
export function registerReservationEventConsumers(
  bus: EventBus,
  confirm: ConfirmReservationUseCase,
  cancelOnRefund: CancelReservationOnRefundUseCase,
  releaseOnCancel: ReleaseHoldsOnFlightCancelledUseCase,
): void {
  bus.subscribe(EventTypes.PaymentProcessed, async (event) => {
    const result = await confirm.execute(event.payload);
    logger.info({ reservationId: event.payload.reservationId, outcome: result.outcome }, 'PaymentProcessed procesado');
  });

  bus.subscribe(EventTypes.PaymentRefunded, async (event) => {
    const cancelled = await cancelOnRefund.execute(event.payload);
    logger.info({ reservationId: event.payload.reservationId, cancelled }, 'PaymentRefunded procesado');
  });

  bus.subscribe(EventTypes.FlightStatusChanged, async (event) => {
    const released = await releaseOnCancel.execute(event.payload.flightId, event.payload.newStatus);
    if (released) logger.info({ flightId: event.payload.flightId, released }, 'Bloqueos liberados por cancelación de vuelo');
  });
}
