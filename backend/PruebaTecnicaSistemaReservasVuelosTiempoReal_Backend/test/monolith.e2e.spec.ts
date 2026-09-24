import request from 'supertest';
import { EventTypes, FlightStatus, PaymentStatus, ReservationStatus, SeatStatus } from '@reservas-vuelos/shared';
import { buildTestMonolith } from './helpers';

process.env.LOG_LEVEL = 'silent';

async function register(app: any, email: string) {
  const res = await request(app).post('/api/v1/auth/register').send({ email, password: 'Secret123*', fullName: 'Usuario Prueba' });
  expect(res.status).toBe(201);
  return res.body.data.accessToken as string;
}

const passenger = {
  firstName: 'Laura',
  lastName: 'Gómez',
  documentType: 'CC',
  documentNumber: '1037999999',
  email: 'laura@example.com',
};

describe('Monolito modular - flujo principal de usuario', () => {
  it('HU1: busca vuelos por origen, destino y fecha con tarifas, horarios y disponibilidad', async () => {
    const { app, flight } = buildTestMonolith();
    const date = new Date(flight.departureTime.getTime() - 5 * 3600e3).toISOString().slice(0, 10);
    const res = await request(app).get('/api/v1/flights/search').query({ origin: 'bog', destination: 'MDE', date });
    expect(res.status).toBe(200);
    const found = res.body.data.find((f: any) => f.id === flight.id);
    expect(found).toBeDefined();
    expect(found.fares.length).toBe(2);
    expect(found.availability.total).toBeGreaterThan(0);
    expect(found.origin.city).toBe('Bogotá');

    const bad = await request(app).get('/api/v1/flights/search').query({ origin: 'BO', destination: 'MDE', date: '25-09-2026' });
    expect(bad.status).toBe(422);
  });

  it('HU2: consulta asiento, lo bloquea y emite SeatLocked; otro usuario recibe 409', async () => {
    const { app, bus, flight } = buildTestMonolith();
    const t1 = await register(app, 'a@test.com');
    const t2 = await register(app, 'b@test.com');

    const seat = await request(app).get(`/api/v1/flights/${flight.id}/seats/5a`);
    expect(seat.status).toBe(200);
    expect(seat.body.data.status).toBe(SeatStatus.AVAILABLE);

    const hold = await request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t1}`).send({ flightId: flight.id, seatNumber: '5A' });
    expect(hold.status).toBe(201);
    expect(hold.body.data.status).toBe(ReservationStatus.PENDING_PAYMENT);
    const minutes = (new Date(hold.body.data.expiresAt).getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(5);
    expect(minutes).toBeLessThanOrEqual(10);
    expect(bus.published.map((e) => e.type)).toContain(EventTypes.SeatLocked);

    const again = await request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t2}`).send({ flightId: flight.id, seatNumber: '5A' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SEAT_NOT_AVAILABLE');

    const mine = await request(app).get(`/api/v1/flights/${flight.id}/seats/5A`).set('Authorization', `Bearer ${t1}`);
    expect(mine.body.data).toMatchObject({ status: SeatStatus.LOCKED, lockedByMe: true });
  });

  it('evita double booking con 25 solicitudes concurrentes sobre el mismo asiento', async () => {
    const { app, flight } = buildTestMonolith();
    const tokens = await Promise.all(Array.from({ length: 25 }, (_, i) => register(app, `u${i}@test.com`)));
    const results = await Promise.all(
      tokens.map((t) => request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t}`).send({ flightId: flight.id, seatNumber: '10C' })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(24);
  });

  it('libera el asiento por tiempo expirado y emite SeatReleased', async () => {
    const { app, bus, clock, modules, flight } = buildTestMonolith();
    const t = await register(app, 'exp@test.com');
    const hold = await request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t}`).send({ flightId: flight.id, seatNumber: '7C' });
    clock.advanceMinutes(8);
    const released = await modules.reservation.api.expireHolds.execute();
    expect(released).toBe(1);
    const ev = bus.published.find((e) => e.type === EventTypes.SeatReleased)!;
    expect(ev.payload).toMatchObject({ seatNumber: '7C', reason: 'EXPIRED', reservationId: hold.body.data.reservationId });
    const seat = await request(app).get(`/api/v1/flights/${flight.id}/seats/7C`);
    expect(seat.body.data.status).toBe(SeatStatus.AVAILABLE);
  });

  it('HU3: PaymentProcessed aprobado confirma la reserva, ocupa el asiento y genera boleto con código único', async () => {
    const { app, bus, external, broker, flight } = buildTestMonolith();
    const t = await register(app, 'pay@test.com');
    const hold = (await request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t}`).send({ flightId: flight.id, seatNumber: '4F' })).body.data;

    await external.publish(EventTypes.PaymentProcessed, flight.id, {
      paymentId: 'pay-1',
      paymentIntentId: 'pi-1',
      reservationId: hold.reservationId,
      flightId: flight.id,
      seatNumber: '4F',
      userId: hold.userId,
      status: PaymentStatus.APPROVED,
      amount: hold.price,
      currency: 'COP',
      passenger: passenger as any,
    });
    await broker.drain();

    const confirmed = bus.published.find((e) => e.type === EventTypes.ReservationConfirmed)!;
    expect(confirmed).toBeDefined();
    expect((confirmed.payload as any).reservationCode).toMatch(/^[A-Z2-9]{6}$/);

    const seat = await request(app).get(`/api/v1/flights/${flight.id}/seats/4F`);
    expect(seat.body.data.status).toBe(SeatStatus.OCCUPIED);

    const ticket = await request(app).get(`/api/v1/reservations/${hold.reservationId}/ticket`).set('Authorization', `Bearer ${t}`);
    expect(ticket.status).toBe(200);
    expect(ticket.body.data).toMatchObject({ status: ReservationStatus.CONFIRMED, seatNumber: '4F', flight: { origin: 'BOG', destination: 'MDE' } });

    const byCode = await request(app).get(`/api/v1/tickets/${ticket.body.data.reservationCode}`).set('Authorization', `Bearer ${t}`);
    expect(byCode.status).toBe(200);

    const customers = await request(app).get('/api/v1/customers/me').set('Authorization', `Bearer ${t}`);
    expect(customers.body.data[0]).toMatchObject({ documentNumber: '1037999999', reservationsCount: 1 });

    const metrics = await request(app).get(`/api/v1/analytics/flights/${flight.id}/metrics`);
    expect(metrics.body.data.occupied).toBe(1);
  });

  it('si el asiento se perdió antes del pago emite ReservationFailed (compensación/reembolso)', async () => {
    const { app, bus, external, broker, clock, flight } = buildTestMonolith();
    const t1 = await register(app, 'late@test.com');
    const t2 = await register(app, 'other@test.com');
    const hold = (await request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t1}`).send({ flightId: flight.id, seatNumber: '12D' })).body.data;
    clock.advanceMinutes(9);
    const other = await request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t2}`).send({ flightId: flight.id, seatNumber: '12D' });
    expect(other.status).toBe(201);

    await external.publish(EventTypes.PaymentProcessed, flight.id, {
      paymentId: 'pay-2', paymentIntentId: 'pi-2', reservationId: hold.reservationId, flightId: flight.id, seatNumber: '12D',
      userId: hold.userId, status: PaymentStatus.APPROVED, amount: hold.price, currency: 'COP', passenger: passenger as any,
    });
    await broker.drain();
    expect(bus.published.map((e) => e.type)).toContain(EventTypes.ReservationFailed);
  });

  it('HU1 tiempo real: FlightStatusChanged actualiza el vuelo y libera bloqueos si se cancela', async () => {
    const { app, bus, external, broker, flight } = buildTestMonolith();
    const t = await register(app, 'cancel@test.com');
    await request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t}`).send({ flightId: flight.id, seatNumber: '6D' });

    await external.publish(EventTypes.FlightStatusChanged, flight.id, {
      flightId: flight.id, flightNumber: flight.flightNumber, previousStatus: FlightStatus.SCHEDULED, newStatus: FlightStatus.CANCELLED, changedBy: 'admin',
    });
    await broker.drain();

    const f = await request(app).get(`/api/v1/flights/${flight.id}`);
    expect(f.body.data.status).toBe(FlightStatus.CANCELLED);
    expect(bus.published.find((e) => e.type === EventTypes.SeatReleased)?.payload).toMatchObject({ reason: 'FLIGHT_CANCELLED' });
    const hold = await request(app).post('/api/v1/reservations/holds').set('Authorization', `Bearer ${t}`).send({ flightId: flight.id, seatNumber: '6F' });
    expect(hold.body.error.code).toBe('FLIGHT_NOT_BOOKABLE');
  });

  it('endpoints internos requieren x-internal-api-key', async () => {
    const { app, flight } = buildTestMonolith();
    expect((await request(app).get(`/api/v1/internal/flights/${flight.id}/seats`)).status).toBe(403);
    const ok = await request(app).get(`/api/v1/internal/flights/${flight.id}/seats`).set('x-internal-api-key', 'internal');
    expect(ok.status).toBe(200);
    expect(ok.body.data.length).toBeGreaterThan(90);
  });
});
