import type { Services } from '@/application/ports';
import { SessionManager, type Session } from '@/application/auth/session';
import type { ActiveCheckout } from '@/application/checkout/checkout-context';
import type { KeyValueStore } from '@/application/ports';
import {
  MonolithAnalyticsApi,
  MonolithAuthApi,
  MonolithCustomerApi,
  MonolithFlightApi,
  MonolithReservationApi,
} from '@/infrastructure/api/monolith.api';
import { FlightManagementApi } from '@/infrastructure/api/flight-management.api';
import { PaymentServiceApi } from '@/infrastructure/api/payment.api';
import { HttpClient } from '@/infrastructure/http/http-client';
import { SocketRealtimeClient } from '@/infrastructure/realtime/socket-realtime.client';
import { SseRealtimeClient } from '@/infrastructure/realtime/sse-realtime.client';
import { SessionStore } from '@/infrastructure/storage/session-store';
import type { AppConfig } from './config/env';

export interface Container {
  services: Services;
  session: SessionManager;
  /** Persistencia del bloqueo/intención de pago en curso (sobrevive a recargar la pestaña). */
  checkoutStore?: KeyValueStore<ActiveCheckout>;
}

/**
 * Composition root: el único lugar que conoce las implementaciones concretas.
 * Conecta los puertos de la aplicación con los adaptadores de cada servicio del diagrama:
 *   Web/Dashboard ──REST──▶ Monolito (:3000) · Payment Service (:3002) · Flight Management Service (:3001)
 *   Web/Dashboard ◀─WebSocket/SSE── Realtime Gateway (:4000) ◀── Kafka
 */
export function createContainer(config: AppConfig): Container {
  const session = new SessionManager(new SessionStore<Session>('skyandes.session'));

  const clientFor = (baseUrl: string) =>
    new HttpClient({ baseUrl, getToken: () => session.token, onUnauthorized: () => session.clear() });

  const monolith = clientFor(config.monolithUrl);
  const fms = clientFor(config.fmsUrl);
  const payments = clientFor(config.paymentUrl);

  const realtime =
    config.realtimeTransport === 'sse'
      ? new SseRealtimeClient(`${config.realtimeUrl}/api/v1`)
      : new SocketRealtimeClient(config.realtimeUrl);

  return {
    session,
    checkoutStore: new SessionStore<ActiveCheckout>('skyandes.checkout'),
    services: {
      auth: new MonolithAuthApi(monolith),
      flights: new MonolithFlightApi(monolith),
      reservations: new MonolithReservationApi(monolith),
      customers: new MonolithCustomerApi(monolith),
      analytics: new MonolithAnalyticsApi(monolith),
      checkout: new PaymentServiceApi(payments),
      flightManagement: new FlightManagementApi(fms),
      realtime,
    },
  };
}
