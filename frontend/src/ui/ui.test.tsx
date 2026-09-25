import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentStatus, SeatStatus, UserRole } from '@reservas-vuelos/shared';
import { AppError } from '@/domain/errors';
import { authResponse, fakeJwt, FLIGHT_ID, flight, holdResponse, seat, seatMap } from '@/test/fixtures';
import { fakeServices, renderApp } from '@/test/fakes';
import type { ActiveCheckout } from '@/application/checkout/checkout-context';
import { SeatMap } from './components/SeatMap';
import { OccupancyBar } from './components/Occupancy';
import { HoldTimer } from './components/HoldTimer';
import { FlightCard } from './components/FlightCard';
import { formatCardNumber, zodFieldErrors } from './forms';
import { LoginPage } from './pages/AuthPages';
import { SeatSelectionPage } from './pages/SeatSelectionPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { MemoryRouter } from 'react-router-dom';
import { loginSchema } from '@reservas-vuelos/shared';

const customerSession = () => ({ accessToken: fakeJwt(), user: authResponse(UserRole.CUSTOMER).user });

describe('SeatMap (a11y + interacción)', () => {
  it('expone cada asiento como botón con etiqueta descriptiva y estado', () => {
    render(<SeatMap map={seatMap()} onSelect={vi.fn()} />);
    expect(screen.getByRole('group', { name: /Mapa de asientos del vuelo SA0140/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Asiento 2A, Ventana, Economy.*Disponible/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Asiento 1F.*Ocupado/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: /Asiento 3B.*Bloqueado temporalmente/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('solo permite seleccionar asientos disponibles', async () => {
    const onSelect = vi.fn();
    render(<SeatMap map={seatMap()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Asiento 1F/ }));
    await userEvent.click(screen.getByRole('button', { name: /Asiento 2B/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].seatNumber).toBe('2B');
  });

  it('navega con flechas usando roving tabindex', async () => {
    render(<SeatMap map={seatMap()} onSelect={vi.fn()} />);
    const first = screen.getByRole('button', { name: /Asiento 1A/ });
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /Asiento 1C/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /Asiento 2C/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('button', { name: /Asiento 2F/ })).toHaveFocus();
  });

  it('marca la selección propia con aria-pressed', () => {
    render(<SeatMap map={seatMap([seat('2A', { status: SeatStatus.LOCKED, lockedByMe: true }), seat('2B')])} />);
    expect(screen.getByRole('button', { name: /Asiento 2A.*Bloqueado por usted/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('componentes de presentación', () => {
  it('OccupancyBar describe la ocupación en texto (no solo color)', () => {
    render(<OccupancyBar counts={{ total: 10, available: 5, locked: 2, occupied: 3 }} label="Vuelo X" />);
    expect(screen.getByRole('img', { name: 'Vuelo X: 3 ocupados, 2 bloqueados y 5 disponibles de 10' })).toBeInTheDocument();
  });

  it('HoldTimer muestra la cuenta regresiva y su barra accesible', () => {
    vi.useFakeTimers();
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    render(<HoldTimer expiresAt={expiresAt} />);
    expect(screen.getByText('01:30')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.getByText('00:59')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '00:59 restantes');
    vi.useRealTimers();
  });

  it('FlightCard ofrece reservar solo vuelos reservables', () => {
    const { rerender } = render(
      <MemoryRouter>
        <FlightCard flight={flight()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Desde/ })).toHaveAttribute('href', `/flights/${FLIGHT_ID}`);
    rerender(
      <MemoryRouter>
        <FlightCard flight={flight({ status: 'CANCELLED' as never })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Desde/ })).not.toBeInTheDocument();
  });

  it('utilidades de formularios', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
    const parsed = loginSchema.safeParse({ email: 'x', password: '1' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(Object.keys(zodFieldErrors(parsed.error))).toEqual(['email', 'password']);
  });
});

describe('LoginPage', () => {
  it('valida con los esquemas compartidos antes de llamar al backend', async () => {
    const app = renderApp([{ path: '/login', element: <LoginPage /> }], { initialPath: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Correo inválido')).toBeInTheDocument();
    expect(app.mocks.auth.login).not.toHaveBeenCalled();
  });

  it('inicia sesión con un usuario de prueba y redirige', async () => {
    const fakes = fakeServices();
    fakes.mocks.auth.login.mockResolvedValue(authResponse());
    const app = renderApp([{ path: '/login', element: <LoginPage /> }, { path: '/', element: <p>inicio</p> }], { initialPath: '/login', services: fakes });
    await userEvent.click(await screen.findByRole('button', { name: 'Cliente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('inicio')).toBeInTheDocument();
    expect(app.mocks.auth.login).toHaveBeenCalledWith({ email: 'cliente@skyandes.com', password: 'Cliente123*' });
  });
});

describe('SeatSelectionPage (HU2 de punta a punta con dobles)', () => {
  const routes = [
    { path: '/flights/:flightId', element: <SeatSelectionPage /> },
    { path: '/checkout', element: <p>checkout</p> },
  ];

  it('refleja al instante el bloqueo de otro pasajero y bloquea el propio', async () => {
    const fakes = fakeServices();
    fakes.mocks.flights.getFlight.mockResolvedValue(flight());
    fakes.mocks.reservations.seatMap.mockResolvedValue(seatMap());
    fakes.mocks.checkout.createHold.mockResolvedValue(holdResponse('2C'));
    const app = renderApp(routes, { initialPath: `/flights/${FLIGHT_ID}`, session: customerSession(), services: fakes });

    const seat2A = await screen.findByRole('button', { name: /Asiento 2A.*Disponible/ });
    act(() =>
      app.realtime.emit('seat:locked', { flightId: FLIGHT_ID, seatNumber: '2A', reservationId: 'x', userId: 'otro', price: 1, currency: 'COP', expiresAt: new Date(Date.now() + 1e5).toISOString() }),
    );
    await waitFor(() => expect(seat2A).toHaveAccessibleName(/Bloqueado temporalmente/));
    expect(screen.getByText('Otro pasajero está comprando el asiento 2A')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Asiento 2C.*Disponible/ }));
    expect(app.mocks.checkout.createHold).toHaveBeenCalledWith(FLIGHT_ID, '2C');
    const summary = await screen.findByRole('complementary', { name: 'Resumen de selección' });
    expect(within(summary).getByRole('link', { name: /Continuar con el pago/ })).toBeInTheDocument();
    expect(within(summary).getByRole('progressbar')).toBeInTheDocument();
  });

  it('ante un conflicto 409 avisa y re-consulta el asiento (endpoint 1)', async () => {
    const fakes = fakeServices();
    fakes.mocks.flights.getFlight.mockResolvedValue(flight());
    fakes.mocks.reservations.seatMap.mockResolvedValue(seatMap());
    fakes.mocks.checkout.createHold.mockRejectedValue(new AppError('tomado', 'SEAT_NOT_AVAILABLE', 409));
    fakes.mocks.reservations.seat.mockResolvedValue(seat('2D', { status: SeatStatus.LOCKED }));
    const app = renderApp(routes, { initialPath: `/flights/${FLIGHT_ID}`, session: customerSession(), services: fakes });

    await userEvent.click(await screen.findByRole('button', { name: /Asiento 2D.*Disponible/ }));
    expect(await screen.findByText(/Otro pasajero acaba de tomar este asiento/)).toBeInTheDocument();
    await waitFor(() => expect(app.mocks.reservations.seat).toHaveBeenCalledWith(FLIGHT_ID, '2D'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Asiento 2D/ })).toHaveAccessibleName(/Bloqueado temporalmente/));
  });

  it('un invitado es enviado a iniciar sesión al elegir asiento', async () => {
    const fakes = fakeServices();
    fakes.mocks.flights.getFlight.mockResolvedValue(flight());
    fakes.mocks.reservations.seatMap.mockResolvedValue(seatMap());
    const app = renderApp([...routes, { path: '/login', element: <p>login</p> }], { initialPath: `/flights/${FLIGHT_ID}`, services: fakes });
    await userEvent.click(await screen.findByRole('button', { name: /Asiento 2A/ }));
    expect(await screen.findByText('login')).toBeInTheDocument();
    expect(app.mocks.checkout.createHold).not.toHaveBeenCalled();
  });
});

describe('CheckoutPage (HU3)', () => {
  it('muestra el rechazo del pago y mantiene el asiento bloqueado', async () => {
    const checkout = {
        ...holdResponse('2C'),
        flight: { id: FLIGHT_ID, flightNumber: 'SA0140', origin: 'BOG', destination: 'CTG', departureTime: '2026-09-25T13:25:00Z', arrivalTime: '2026-09-25T14:50:00Z' },
        seat: { seatNumber: '2C', cabinClass: 'ECONOMY', position: 'AISLE' },
        userId: 'user-1',
      } as ActiveCheckout;
    const fakes = fakeServices();
    fakes.mocks.checkout.pay.mockResolvedValue({ id: 'p1', status: PaymentStatus.DECLINED, declineReason: 'Fondos insuficientes' });
    const app = renderApp([{ path: '/checkout', element: <CheckoutPage /> }], { initialPath: '/checkout', session: customerSession(), services: fakes, checkout });

    await userEvent.type(await screen.findByLabelText(/Número de documento/), '1037600123');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazada' }));
    await userEvent.type(screen.getByLabelText(/CVV/), '123');
    await userEvent.click(screen.getByRole('button', { name: /Pagar/ }));

    expect(await screen.findByText('Pago rechazado')).toBeInTheDocument();
    expect(screen.getByText(/Fondos insuficientes/)).toBeInTheDocument();
    const input = app.mocks.checkout.pay.mock.calls[0][0];
    expect(input).toMatchObject({ paymentIntentId: 'pi-1', card: { number: '4000000000000002' }, passenger: { documentNumber: '1037600123' } });
  });

  it('valida los datos del pasajero y la tarjeta (Luhn) antes de pagar', async () => {
    const checkout = { ...holdResponse('2C'), flight: { id: FLIGHT_ID, flightNumber: 'SA0140', origin: 'BOG', destination: 'CTG', departureTime: '', arrivalTime: '' }, seat: { seatNumber: '2C', cabinClass: 'ECONOMY', position: 'AISLE' }, userId: 'user-1' } as ActiveCheckout;
    const app = renderApp([{ path: '/checkout', element: <CheckoutPage /> }], { initialPath: '/checkout', session: customerSession(), checkout });
    await userEvent.type(await screen.findByLabelText(/Número de tarjeta/), '1234 5678 9012 3456');
    await userEvent.click(screen.getByRole('button', { name: /Pagar/ }));
    expect(await screen.findByText('Número de tarjeta inválido')).toBeInTheDocument();
    expect(app.mocks.checkout.pay).not.toHaveBeenCalled();
  });

  it('sin bloqueo activo invita a buscar vuelos', async () => {
    renderApp([{ path: '/checkout', element: <CheckoutPage /> }], { initialPath: '/checkout', session: customerSession() });
    expect(await screen.findByText('No tiene un asiento bloqueado')).toBeInTheDocument();
  });
});
