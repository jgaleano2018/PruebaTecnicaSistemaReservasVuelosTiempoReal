import { EventTypes, SeatStatus } from '@reservas-vuelos/shared';
import { EventBus } from '../../shared/application/event-bus.port';
import { DashboardService } from '../../application/dashboard.use-cases';

/**
 * Suscripciones Kafka del Flight Management Service (HU4):
 * cada bloqueo, liberación por expiración o reserva confirmada actualiza el dashboard al instante.
 */
export function registerConsumers(bus: EventBus, dashboard: DashboardService): void {
  bus.subscribe(EventTypes.SeatLocked, async (e) => {
    await dashboard.applySeatEvent(e.payload.flightId, e.payload.seatNumber, SeatStatus.LOCKED);
  });
  bus.subscribe(EventTypes.SeatReleased, async (e) => {
    await dashboard.applySeatEvent(e.payload.flightId, e.payload.seatNumber, SeatStatus.AVAILABLE);
  });
  bus.subscribe(EventTypes.ReservationConfirmed, async (e) => {
    await dashboard.applySeatEvent(e.payload.flightId, e.payload.seatNumber, SeatStatus.OCCUPIED);
  });
}
