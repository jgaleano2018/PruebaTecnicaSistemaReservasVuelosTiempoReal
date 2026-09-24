import { EventTypes } from '@reservas-vuelos/shared';
import { EventBus } from '@reservas-vuelos/service-kernel';
import { RealtimeHub } from './application/realtime-hub';
import { buildRealtimeRouter } from './infrastructure/http/realtime.routes';

/** Módulo de Tiempo Real (Realtime): suscripción a eventos, notificaciones en vivo, actualización de estados. */
export function createRealtimeModule(bus: EventBus) {
  const hub = new RealtimeHub(bus);
  const consumes = [EventTypes.FlightStatusChanged, EventTypes.PaymentProcessed, EventTypes.PaymentRefunded];
  return { router: buildRealtimeRouter(hub, consumes), api: { hub } };
}
