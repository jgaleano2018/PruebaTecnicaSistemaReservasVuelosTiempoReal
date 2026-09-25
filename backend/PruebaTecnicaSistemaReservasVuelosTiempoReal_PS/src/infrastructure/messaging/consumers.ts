import { EventTypes, FlightStatus } from '@reservas-vuelos/shared';
import { EventBus } from '../../shared/application/event-bus.port';
import { PaymentEventHandlers } from '../../application/payment.use-cases';

/** Suscripciones Kafka del Payment Service. */
export function registerConsumers(bus: EventBus, h: PaymentEventHandlers): void {
  bus.subscribe(EventTypes.SeatReleased, (e) => h.onSeatReleased(e.payload.reservationId, e.payload.reason));
  bus.subscribe(EventTypes.ReservationFailed, (e) => h.onReservationFailed(e.payload.paymentId, e.payload.reason));
  bus.subscribe(EventTypes.ReservationConfirmed, (e) => h.onReservationConfirmed(e.payload.reservationId, e.payload.reservationCode));
  bus.subscribe(EventTypes.FlightStatusChanged, async (e) => {
    if (e.payload.newStatus === FlightStatus.CANCELLED) await h.onFlightCancelled(e.payload.flightId);
  });
}
