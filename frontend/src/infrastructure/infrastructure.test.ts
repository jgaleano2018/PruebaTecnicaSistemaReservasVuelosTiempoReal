import { describe, expect, it, vi } from 'vitest';
import { ClientSocketEvents, SeatReleaseReason } from '@reservas-vuelos/shared';
import { AppError } from '@/domain/errors';
import { HttpClient, buildUrl } from './http/http-client';
import { PaymentServiceApi } from './api/payment.api';
import { MonolithFlightApi } from './api/monolith.api';
import { FlightManagementApi } from './api/flight-management.api';
import { channelKey, matchesChannel } from './realtime/channel-matching';
import { SocketRealtimeClient } from './realtime/socket-realtime.client';
import { SseRealtimeClient } from './realtime/sse-realtime.client';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('HttpClient', () => {
  it('construye URLs omitiendo parámetros vacíos', () => {
    expect(buildUrl('http://x/api/v1/', '/flights/search', { origin: 'BOG', maxPrice: undefined, cabinClass: '' })).toBe('http://x/api/v1/flights/search?origin=BOG');
  });

  it('desenvuelve { success, data } y envía el JWT', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { success: true, data: [1, 2] }));
    const http = new HttpClient({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl });
    await expect(http.get('/a')).resolves.toEqual([1, 2]);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('normaliza errores del backend en AppError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(409, { success: false, error: { code: 'SEAT_NOT_AVAILABLE', message: 'tomado' } }));
    const http = new HttpClient({ baseUrl: 'http://x', fetchImpl });
    const err = (await http.post('/a', {}).catch((e: unknown) => e)) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'SEAT_NOT_AVAILABLE', status: 409 });
    expect(err.isConflict).toBe(true);
  });

  it('notifica 401 (sesión expirada)', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(json(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'no' } }));
    await new HttpClient({ baseUrl: 'http://x', fetchImpl, onUnauthorized }).get('/a').catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('falla sin llamar al servidor si el endpoint exige sesión y no hay token', async () => {
    const fetchImpl = vi.fn();
    const err = (await new HttpClient({ baseUrl: 'http://x', fetchImpl }).get('/a', { auth: 'required' }).catch((e: unknown) => e)) as AppError;
    expect(err.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('traduce errores de red', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await new HttpClient({ baseUrl: 'http://x', fetchImpl }).get('/a').catch((e) => e);
    expect(err).toMatchObject({ code: 'NETWORK_ERROR', isNetwork: true });
  });

  it('el pago rechazado (402 con success:true) se devuelve como resultado de negocio', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(402, { success: true, data: { id: 'p1', status: 'DECLINED' } }));
    const api = new PaymentServiceApi(new HttpClient({ baseUrl: 'http://pay', getToken: () => 't', fetchImpl }));
    await expect(api.pay({} as never)).resolves.toMatchObject({ status: 'DECLINED' });
  });
});

describe('adaptadores REST', () => {
  it('HU1 busca vuelos en el monolito con los filtros', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { success: true, data: [] }));
    await new MonolithFlightApi(new HttpClient({ baseUrl: 'http://m/api/v1', fetchImpl })).search({ origin: 'BOG', destination: 'MDE', date: '2026-09-25', maxPrice: 500000 });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://m/api/v1/flights/search?origin=BOG&destination=MDE&date=2026-09-25&maxPrice=500000');
  });

  it('HU2 bloquea el asiento a través del Payment Service (no directo al monolito)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(201, { success: true, data: {} }));
    await new PaymentServiceApi(new HttpClient({ baseUrl: 'http://pay/api/v1', getToken: () => 't', fetchImpl })).createHold('F1', '12A');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://pay/api/v1/checkout/holds');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ flightId: 'F1', seatNumber: '12A' });
  });

  it('HU4 abre el SSE del FMS y despacha snapshot y occupancy', () => {
    const listeners: Record<string, (e: MessageEvent) => void> = {};
    const source = { addEventListener: (n: string, fn: (e: MessageEvent) => void) => (listeners[n] = fn), removeEventListener: vi.fn(), close: vi.fn() };
    const factory = vi.fn(() => source as unknown as EventSource);
    const api = new FlightManagementApi(new HttpClient({ baseUrl: 'http://fms/api/v1' }), factory);
    const onSnapshot = vi.fn();
    const onOccupancy = vi.fn();
    const close = api.streamOccupancy('F1', { onSnapshot, onOccupancy });
    expect(factory).toHaveBeenCalledWith('http://fms/api/v1/dashboard/flights/F1/stream');
    listeners.snapshot({ data: JSON.stringify({ flightId: 'F1', locked: 0 }) } as MessageEvent);
    listeners.occupancy({ data: JSON.stringify({ flightId: 'F1', locked: 1 }) } as MessageEvent);
    listeners.occupancy({ data: 'no-json' } as MessageEvent);
    expect(onSnapshot).toHaveBeenCalledWith({ flightId: 'F1', locked: 0 });
    expect(onOccupancy).toHaveBeenCalledTimes(1);
    close();
    expect(source.close).toHaveBeenCalled();
  });
});

describe('canales de tiempo real', () => {
  it('usa la misma convención de salas que el gateway', () => {
    expect(channelKey({ kind: 'flight', flightId: 'F1' })).toBe('flight:F1');
    expect(channelKey({ kind: 'dashboard', flightId: 'all' })).toBe('dashboard:all');
    expect(channelKey({ kind: 'flights' })).toBe('flights:list');
  });

  it('filtra eventos por vuelo / reserva', () => {
    expect(matchesChannel({ kind: 'flight', flightId: 'F1' }, 'seat:locked', { flightId: 'F1' })).toBe(true);
    expect(matchesChannel({ kind: 'flight', flightId: 'F1' }, 'seat:locked', { flightId: 'F2' })).toBe(false);
    expect(matchesChannel({ kind: 'reservation', reservationId: 'r' }, 'reservation:confirmed', { reservationId: 'r' })).toBe(true);
    expect(matchesChannel({ kind: 'flights' }, 'seat:locked', { flightId: 'F1' })).toBe(false);
    expect(matchesChannel({ kind: 'flights' }, 'flight:status-changed', { flightId: 'F1' })).toBe(true);
  });
});

/** Socket.io falso: registra emisiones y permite disparar eventos del servidor. */
function fakeSocket() {
  const handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  const socket = {
    connected: false,
    active: true,
    connect: vi.fn(),
    emitted: [] as unknown[][],
    on(ev: string, fn: (...a: unknown[]) => void) {
      handlers.set(ev, [...(handlers.get(ev) ?? []), fn]);
      return socket;
    },
    emit(...args: unknown[]) {
      socket.emitted.push(args);
      return socket;
    },
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
    fire(ev: string, ...args: unknown[]) {
      if (ev === 'connect') socket.connected = true;
      if (ev === 'disconnect') socket.connected = false;
      handlers.get(ev)?.forEach((fn) => fn(...args));
    },
  };
  return socket;
}

describe('SocketRealtimeClient', () => {
  it('se suscribe a la sala, despacha eventos filtrados y re-suscribe al reconectar', () => {
    const socket = fakeSocket();
    const client = new SocketRealtimeClient('http://rg', () => socket as never);
    const onLocked = vi.fn();
    const onResync = vi.fn();
    const states: string[] = [];
    client.onConnectionChange((s) => states.push(s));
    client.onResync(onResync);

    client.subscribe({ kind: 'flight', flightId: 'F1' }, { 'seat:locked': onLocked });
    client.connect('jwt');
    socket.fire('connect');
    expect(socket.emitted[0].slice(0, 2)).toEqual([ClientSocketEvents.SubscribeFlight, 'F1']);

    socket.fire('seat:locked', { flightId: 'F1', seatNumber: '1A' });
    socket.fire('seat:locked', { flightId: 'F2', seatNumber: '1A' });
    expect(onLocked).toHaveBeenCalledTimes(1);

    socket.fire('disconnect');
    socket.fire('connect');
    expect(socket.emitted.filter((e) => e[0] === ClientSocketEvents.SubscribeFlight)).toHaveLength(2);
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['disconnected', 'connecting', 'connected', 'reconnecting', 'connected']);
  });

  it('cuenta referencias: solo abandona la sala con el último suscriptor', () => {
    const socket = fakeSocket();
    const client = new SocketRealtimeClient('http://rg', () => socket as never);
    client.connect(null);
    socket.fire('connect');
    const u1 = client.subscribe({ kind: 'dashboard', flightId: 'all' }, {});
    const u2 = client.subscribe({ kind: 'dashboard', flightId: 'all' }, {});
    expect(socket.emitted.filter((e) => e[0] === ClientSocketEvents.SubscribeDashboard)).toHaveLength(1);
    u1();
    expect(socket.emitted.some((e) => e[0] === ClientSocketEvents.UnsubscribeDashboard)).toBe(false);
    u2();
    expect(socket.emitted.some((e) => e[0] === ClientSocketEvents.UnsubscribeDashboard)).toBe(true);
  });

  it('reconecta con el nuevo token al cambiar la sesión', () => {
    const sockets = [fakeSocket(), fakeSocket()];
    const factory = vi.fn((_url: string, _t: string | null) => sockets[factory.mock.calls.length - 1] as never);
    const client = new SocketRealtimeClient('http://rg', factory);
    client.connect(null);
    client.connect(null);
    client.connect('nuevo');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[1][1]).toBe('nuevo');
    expect(sockets[0].disconnect).toHaveBeenCalled();
  });

  it('si el gateway rechaza el JWT (vencido) continúa como invitado en vez de quedarse "reconectando"', () => {
    const sockets = [fakeSocket(), fakeSocket()];
    const factory = vi.fn((_url: string, _t: string | null) => sockets[factory.mock.calls.length - 1] as never);
    const client = new SocketRealtimeClient('http://rg', factory);
    client.connect('vencido');
    sockets[0].active = false; // Socket.io no reintenta tras un rechazo del middleware
    sockets[0].fire('connect_error', new Error('Token inválido'));
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[1][1]).toBeNull();
  });

  it('se reconecta explícitamente cuando el servidor cierra la conexión', () => {
    const socket = fakeSocket();
    const client = new SocketRealtimeClient('http://rg', () => socket as never);
    const states: string[] = [];
    client.onConnectionChange((st) => states.push(st));
    client.connect(null);
    socket.fire('connect');
    socket.fire('disconnect', 'io server disconnect');
    expect(socket.connect).toHaveBeenCalled();
    expect(states.at(-1)).toBe('reconnecting');
  });
});

describe('SseRealtimeClient (respaldo)', () => {
  type FakeSource = { url: string; listeners: Record<string, (e: MessageEvent | Event) => void>; close: ReturnType<typeof vi.fn> };
  function fakeFactory() {
    const sources: FakeSource[] = [];
    const factory = (url: string) => {
      const s = {
        url,
        listeners: {} as FakeSource['listeners'],
        close: vi.fn(),
        addEventListener(n: string, fn: (e: MessageEvent | Event) => void) { s.listeners[n] = fn; },
        removeEventListener: vi.fn(),
      };
      sources.push(s);
      return s as unknown as EventSource;
    };
    return { sources, factory };
  }

  it('abre un EventSource por canal SOLO en el Realtime Gateway (nunca en el SSE público del monolito)', () => {
    const { sources, factory } = fakeFactory();
    const client = new SseRealtimeClient('http://rg/api/v1', factory);
    client.connect();
    const onReleased = vi.fn();
    client.subscribe({ kind: 'flight', flightId: 'F1' }, { 'seat:released': onReleased });
    client.subscribe({ kind: 'flights' }, {});
    // La confirmación de la reserva se resuelve por REST: no abre ningún stream
    client.subscribe({ kind: 'reservation', reservationId: 'r1' }, { 'reservation:confirmed': vi.fn() });
    expect(sources.map((s) => s.url)).toEqual(['http://rg/api/v1/sse/flights/F1', 'http://rg/api/v1/sse/flights']);
    expect(sources.every((s) => s.url.startsWith('http://rg/'))).toBe(true);

    sources[0].listeners['seat:released']({ data: JSON.stringify({ flightId: 'F1', seatNumber: '1A', reason: SeatReleaseReason.EXPIRED }) } as MessageEvent);
    expect(onReleased).toHaveBeenCalledTimes(1);
    client.disconnect();
    expect(sources.every((s) => s.close.mock.calls.length === 1)).toBe(true);
  });

  it('solo informa "conectado" cuando todos los streams están abiertos', () => {
    const { sources, factory } = fakeFactory();
    const client = new SseRealtimeClient('http://rg/api/v1', factory);
    const states: string[] = [];
    client.onConnectionChange((st) => states.push(st));
    client.connect();
    client.subscribe({ kind: 'flight', flightId: 'F1' }, {});
    client.subscribe({ kind: 'dashboard', flightId: 'F1' }, {});
    sources[0].listeners.open(new Event('open'));
    sources[1].listeners.error(new Event('error'));
    expect(states.at(-1)).toBe('reconnecting');
    sources[1].listeners.open(new Event('open'));
    expect(states.at(-1)).toBe('connected');
  });
});
