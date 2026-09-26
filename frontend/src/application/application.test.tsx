import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { FlightStatus, SeatReleaseReason, SeatStatus, UserRole } from '@reservas-vuelos/shared';
import { authResponse, FLIGHT_ID, fakeJwt, holdResponse, seatMap } from '@/test/fixtures';
import { fakeServices, MemoryStore } from '@/test/fakes';
import { AppProviders } from '@/app/providers/AppProviders';
import { SessionManager, jwtExpiry, type Session } from './auth/session';
import { useAuth } from './auth/auth-context';
import { useCheckout, type ActiveCheckout } from './checkout/checkout-context';
import { useLiveSeatMap } from './hooks/seats.hooks';
import { useFlightSearch } from './hooks/flights.hooks';
import { useApplyConfirmedReservation, useAwaitConfirmation } from './hooks/reservations.hooks';
import { queryKeys } from './query-keys';
import { seat } from '@/test/fixtures';
import { flight } from '@/test/fixtures';

describe('SessionManager', () => {
  it('persiste la sesión, decodifica exp y notifica cambios', () => {
    const store = new MemoryStore<Session>();
    const session = new SessionManager(store);
    const listener = vi.fn();
    session.subscribe(listener);
    session.start(authResponse());
    expect(session.token).toBeTruthy();
    expect(store.get()?.user.role).toBe(UserRole.CUSTOMER);
    expect(listener).toHaveBeenCalledTimes(1);
    session.clear();
    expect(session.token).toBeNull();
    expect(store.get()).toBeNull();
  });

  it('descarta un token expirado', () => {
    const expired: Session = { accessToken: fakeJwt(1), user: authResponse().user, expiresAt: 1000 };
    const session = new SessionManager(new MemoryStore(expired));
    expect(session.current).toBeNull();
    expect(jwtExpiry('no-es-jwt')).toBeUndefined();
  });

  it('cierra la sesión automáticamente al vencer el JWT (sin esperar un 401)', () => {
    vi.useFakeTimers();
    try {
      const session = new SessionManager(new MemoryStore<Session>());
      const listener = vi.fn();
      session.subscribe(listener);
      session.start({ ...authResponse(), accessToken: fakeJwt(Math.floor(Date.now() / 1000) + 60) });
      expect(session.current).not.toBeNull();
      vi.advanceTimersByTime(61_000);
      expect(session.current).toBeNull();
      expect(listener).toHaveBeenLastCalledWith(null);
    } finally {
      vi.useRealTimers();
    }
  });
});

function setup(sessionUser = true) {
  const fakes = fakeServices();
  const session = new SessionManager(new MemoryStore<Session>(sessionUser ? { accessToken: fakeJwt(), user: authResponse().user } : null));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProviders container={{ services: fakes.services, session }} queryClient={queryClient}>
      {children}
    </AppProviders>
  );
  return { ...fakes, session, wrapper, queryClient };
}

describe('AuthProvider', () => {
  it('login inicia sesión y reconecta el WebSocket con el JWT', async () => {
    const { mocks, realtime, wrapper } = setup(false);
    mocks.auth.login.mockResolvedValue(authResponse(UserRole.ADMIN));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(false);
    await act(() => result.current.login({ email: 'a@b.co', password: '123456' }));
    expect(result.current.user?.role).toBe(UserRole.ADMIN);
    await waitFor(() => expect(realtime.connect).toHaveBeenLastCalledWith(result.current.token));
    act(() => result.current.logout());
    expect(result.current.user).toBeNull();
  });
});

describe('useLiveSeatMap (HU2 tiempo real)', () => {
  it('carga el mapa por REST y aplica seat:locked / seat:occupied del gateway', async () => {
    const { mocks, realtime, wrapper } = setup();
    mocks.reservations.seatMap.mockResolvedValue(seatMap());
    const { result } = renderHook(() => useLiveSeatMap(FLIGHT_ID), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(realtime.subscriptions.some((s) => s.channel.kind === 'flight')).toBe(true);

    act(() =>
      realtime.emit('seat:locked', { flightId: FLIGHT_ID, seatNumber: '2A', reservationId: 'r9', userId: 'otro', price: 1, currency: 'COP', expiresAt: new Date(Date.now() + 1e5).toISOString() }),
    );
    await waitFor(() => expect(result.current.data?.seats.find((s) => s.seatNumber === '2A')?.status).toBe(SeatStatus.LOCKED));
    expect(result.current.activity[0]).toMatchObject({ seatNumber: '2A', kind: 'locked', mine: false });

    act(() =>
      realtime.emit('seat:occupied', {
        reservationId: 'r9', reservationCode: 'X', flightId: FLIGHT_ID, flightNumber: 'SA0140', seatNumber: '2A', userId: 'otro', customerId: 'c', paymentId: 'p', price: 1, currency: 'COP', confirmedAt: '',
      }),
    );
    await waitFor(() => expect(result.current.data?.seats.find((s) => s.seatNumber === '2A')?.status).toBe(SeatStatus.OCCUPIED));
  });
});

describe('useFlightSearch (HU1 tiempo real)', () => {
  it('refleja un cambio de estado de vuelo sin volver a consultar', async () => {
    const { mocks, realtime, wrapper } = setup();
    mocks.flights.search.mockResolvedValue([flight()]);
    const query = { origin: 'BOG', destination: 'CTG', date: '2026-09-25' };
    const { result } = renderHook(() => useFlightSearch(query), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    act(() =>
      realtime.emit('flight:status-changed', { flightId: FLIGHT_ID, flightNumber: 'SA0140', previousStatus: FlightStatus.SCHEDULED, newStatus: FlightStatus.CANCELLED, changedBy: 'admin' }),
    );
    await waitFor(() => expect(result.current.data?.[0].status).toBe(FlightStatus.CANCELLED));
    expect(mocks.flights.search).toHaveBeenCalledTimes(1);
  });
});

describe('CheckoutProvider (bloqueo temporal)', () => {
  const flightInfo = { id: FLIGHT_ID, flightNumber: 'SA0140', origin: 'BOG', destination: 'CTG', departureTime: '', arrivalTime: '' };
  const seatInfo = { seatNumber: '2C', cabinClass: 'ECONOMY', position: 'AISLE' } as ActiveCheckout['seat'];

  it('bloquea vía Payment Service y se libera al recibir SeatReleased (expiración)', async () => {
    const { mocks, realtime, wrapper } = setup();
    mocks.checkout.createHold.mockResolvedValue(holdResponse('2C'));
    const { result } = renderHook(() => useCheckout(), { wrapper });
    await act(() => result.current.holdSeat(flightInfo, seatInfo));
    expect(mocks.checkout.createHold).toHaveBeenCalledWith(FLIGHT_ID, '2C');
    expect(result.current.active?.hold.reservationId).toBe('res-1');

    act(() => realtime.emit('seat:released', { flightId: FLIGHT_ID, seatNumber: '2C', reservationId: 'res-1', reason: SeatReleaseReason.EXPIRED }));
    await waitFor(() => expect(result.current.active).toBeNull());
    expect(result.current.lastRelease).toMatchObject({ seatNumber: '2C', reason: SeatReleaseReason.EXPIRED });
  });

  it('al cambiar de asiento libera primero el bloqueo anterior', async () => {
    const { mocks, wrapper } = setup();
    mocks.checkout.createHold.mockResolvedValueOnce(holdResponse('2C')).mockResolvedValueOnce({ ...holdResponse('2D'), hold: { ...holdResponse('2D').hold, reservationId: 'res-2' } });
    mocks.checkout.releaseHold.mockResolvedValue({});
    const { result } = renderHook(() => useCheckout(), { wrapper });
    await act(() => result.current.holdSeat(flightInfo, seatInfo));
    await act(() => result.current.holdSeat(flightInfo, { ...seatInfo, seatNumber: '2D' }));
    expect(mocks.checkout.releaseHold).toHaveBeenCalledWith('res-1');
    expect(result.current.active?.hold.seatNumber).toBe('2D');
  });

  it('un evento de otra reserva no afecta el bloqueo propio', async () => {
    const { mocks, realtime, wrapper } = setup();
    mocks.checkout.createHold.mockResolvedValue(holdResponse('2C'));
    const { result } = renderHook(() => useCheckout(), { wrapper });
    await act(() => result.current.holdSeat(flightInfo, seatInfo));
    act(() => realtime.emit('seat:released', { flightId: FLIGHT_ID, seatNumber: '3A', reservationId: 'otra', reason: SeatReleaseReason.EXPIRED }));
    expect(result.current.active).not.toBeNull();
  });
});

describe('useAwaitConfirmation (HU3)', () => {
  it('se confirma con el evento reservation:confirmed del gateway', async () => {
    const { mocks, realtime, wrapper } = setup();
    mocks.reservations.reservation.mockResolvedValue({ id: 'res-1', status: 'PENDING_PAYMENT' });
    const { result } = renderHook(() => useAwaitConfirmation('res-1', true), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('waiting'));
    act(() =>
      realtime.emit('reservation:confirmed', {
        reservationId: 'res-1', reservationCode: 'ABC123', flightId: FLIGHT_ID, flightNumber: 'SA0140', seatNumber: '2C', userId: 'user-1', customerId: 'c', paymentId: 'p', price: 1, currency: 'COP', confirmedAt: '',
      }),
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'confirmed', reservationCode: 'ABC123' }));
  });

  it('usa la consulta REST como respaldo si el evento no llega', async () => {
    const { mocks, wrapper } = setup();
    mocks.reservations.reservation.mockResolvedValue({ id: 'res-1', status: 'CONFIRMED', reservationCode: 'ZZZ999' });
    const { result } = renderHook(() => useAwaitConfirmation('res-1', true), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ status: 'confirmed', reservationCode: 'ZZZ999' }));
  });
});

describe('HU3 · asiento ocupado de forma permanente tras confirmar (regresión)', () => {
  it('actualiza la caché del mapa al confirmar y re-consulta el servidor al volver a la vista', async () => {
    const { mocks, wrapper, queryClient } = setup();
    // 1. El comprador ve su asiento bloqueado y pasa al checkout (la vista del mapa se desmonta)
    mocks.reservations.seatMap.mockResolvedValue(seatMap([seat('1A', { status: SeatStatus.LOCKED, lockedByMe: true }), seat('1C')]));
    const first = renderHook(() => useLiveSeatMap(FLIGHT_ID), { wrapper });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();

    // 2. La reserva se confirma mientras el mapa no está montado: se aplica la ocupación sobre la caché
    const { result } = renderHook(() => useApplyConfirmedReservation(), { wrapper });
    act(() => result.current({ flightId: FLIGHT_ID, seatNumber: '1A', reservationId: 'res-1' }, 'ABC234'));
    const cachedKey = queryClient.getQueryCache().findAll({ queryKey: queryKeys.seatMapAll(FLIGHT_ID) })[0].queryKey;
    const cached = queryClient.getQueryData<ReturnType<typeof seatMap>>(cachedKey);
    expect(cached?.seats.find((s) => s.seatNumber === '1A')?.status).toBe(SeatStatus.OCCUPIED);

    // 3. Al volver al mapa se consulta de nuevo el estado real (OCUPADO) aunque la caché fuera reciente
    mocks.reservations.seatMap.mockResolvedValue(seatMap([seat('1A', { status: SeatStatus.OCCUPIED }), seat('1C')]));
    const again = renderHook(() => useLiveSeatMap(FLIGHT_ID), { wrapper });
    await waitFor(() => expect(mocks.reservations.seatMap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(again.result.current.data?.seats.find((s) => s.seatNumber === '1A')?.status).toBe(SeatStatus.OCCUPIED));
  });
});
