import { EventTypes } from '@reservas-vuelos/shared';
import { EventBus, logger } from '@reservas-vuelos/service-kernel';
import { ApplyFlightStatusChangeUseCase } from '../../application/flight.use-cases';

/** Adaptador de entrada (driving): suscripción al evento FlightStatusChanged. */
export function registerFlightEventConsumers(bus: EventBus, applyStatus: ApplyFlightStatusChangeUseCase): void {
  bus.subscribe(EventTypes.FlightStatusChanged, async (event) => {
    const updated = await applyStatus.execute(event.payload);
    logger.info(
      { flightId: event.payload.flightId, status: event.payload.newStatus, found: !!updated },
      'Estado de vuelo actualizado desde FlightStatusChanged',
    );
  });
}
