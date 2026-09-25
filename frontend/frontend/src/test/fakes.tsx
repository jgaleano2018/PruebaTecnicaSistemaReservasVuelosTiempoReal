import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { vi } from 'vitest';
import type {
  ConnectionState,
  RealtimeChannel,
  RealtimeClient,
  RealtimeEventName,
  RealtimeHandlers,
  RealtimePayload,
  Services,
  Unsubscribe,
} from '@/application/ports';
import { SessionManager, type Session } from '@/application/auth/session';
import { AppProviders } from '@/app/providers/AppProviders';
import type { Container } from '@/app/container';
import type { ActiveCheckout } from '@/application/checkout/checkout-context';
import { matchesChannel } from '@/infrastructure/realtime/channel-matching';

/** Almacén en memoria para pruebas. */
export class MemoryStore<T> {
  constructor(private value: T | null = null) {}
  get() {
    return this.value;
  }
  set(v: T) {
    this.value = v;
  }
  clear() {
    this.value = null;
  }
}

/** Doble del Realtime Gateway: permite emitir eventos como si llegaran de Kafka → gateway. */
export class FakeRealtimeClient implements RealtimeClient {
  readonly transport = 'websocket' as const;
  readonly subscriptions: { channel: RealtimeChannel; handlers: RealtimeHandlers }[] = [];
  connect = vi.fn();
  disconnect = vi.fn();

  subscribe(channel: RealtimeChannel, handlers: RealtimeHandlers): Unsubscribe {
    const entry = { channel, handlers };
    this.subscriptions.push(entry);
    return () => {
      const i = this.subscriptions.indexOf(entry);
      if (i >= 0) this.subscriptions.splice(i, 1);
    };
  }

  emit<E extends RealtimeEventName>(event: E, payload: RealtimePayload<E>): void {
    for (const { channel, handlers } of [...this.subscriptions]) {
      const h = handlers[event] as ((p: unknown) => void) | undefined;
      if (h && matchesChannel(channel, event, payload)) h(payload);
    }
  }

  onConnectionChange(listener: (s: ConnectionState) => void): Unsubscribe {
    listener('connected');
    return () => undefined;
  }

  onResync(): Unsubscribe {
    return () => undefined;
  }
}

type DeepMock<T> = { [K in keyof T]: T[K] extends object ? { [M in keyof T[K]]: ReturnType<typeof vi.fn> } : T[K] };

/** Servicios falsos: cada método es un vi.fn() que por defecto rechaza (hay que configurarlo en la prueba). */
export function fakeServices(): { services: Services; mocks: DeepMock<Omit<Services, 'realtime'>>; realtime: FakeRealtimeClient } {
  const unconfigured = (name: string) => vi.fn(() => Promise.reject(new Error(`${name} no configurado en la prueba`)));
  const group = <K extends string>(prefix: string, methods: K[]) =>
    Object.fromEntries(methods.map((m) => [m, unconfigured(`${prefix}.${m}`)])) as Record<K, ReturnType<typeof vi.fn>>;

  const realtime = new FakeRealtimeClient();
  const mocks = {
    auth: group('auth', ['login', 'register', 'me']),
    flights: group('flights', ['search', 'getFlight', 'airports', 'routes', 'aircraft']),
    reservations: group('reservations', ['seatMap', 'seat', 'myReservations', 'reservation', 'ticketByReservation', 'ticketByCode']),
    customers: group('customers', ['mine', 'byId', 'reservations', 'list', 'updateContact']),
    analytics: group('analytics', ['flightMetrics', 'demand', 'summary', 'realtimeStatus']),
    checkout: group('checkout', ['createHold', 'releaseHold', 'paymentIntent', 'pay', 'myPayments', 'payment', 'refund']),
    flightManagement: {
      ...group('fms', ['overview', 'flightsOccupancy', 'occupancy', 'flights', 'flight', 'statusHistory', 'changeStatus', 'syncFlights', 'syncAirlines', 'syncLog']),
      streamOccupancy: vi.fn(() => () => undefined),
    },
  };
  mocks.auth.me.mockImplementation(() => new Promise(() => undefined));
  return { services: { ...(mocks as unknown as Omit<Services, 'realtime'>), realtime }, mocks: mocks as never, realtime };
}

export function renderApp(
  routes: RouteObject[],
  {
    initialPath = '/',
    session,
    services,
    checkout,
  }: { initialPath?: string; session?: Session | null; services?: ReturnType<typeof fakeServices>; checkout?: ActiveCheckout | null } = {},
) {
  const fakes = services ?? fakeServices();
  const sessionManager = new SessionManager(new MemoryStore<Session>(session ?? null));
  const container: Container = { services: fakes.services, session: sessionManager, checkoutStore: new MemoryStore<ActiveCheckout>(checkout ?? null) };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const utils = render(
    <AppProviders container={container} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, ...fakes, router, sessionManager, queryClient };
}

export const withinRoute = (path: string, element: ReactNode): RouteObject[] => [
  { path, element },
  { path: '*', element: <p>otra ruta</p> },
];
