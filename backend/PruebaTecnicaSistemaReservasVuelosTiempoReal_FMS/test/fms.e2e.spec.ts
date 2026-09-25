import request from 'supertest';
import { firstValueFrom, take, toArray } from 'rxjs';
import { EventTypes, FlightDto, FlightStatus, SeatStatus, UserRole } from '@reservas-vuelos/shared';
import { compose } from '../src/container';
import { createHttpApp } from '../src/app';
import { InMemoryBroker, InMemoryEventBus } from '@reservas-vuelos/service-kernel';
import {
  InMemoryManagedFlightRepository,
  InMemoryOccupancyRepository,
  InMemoryStatusHistoryRepository,
  InMemorySyncLogRepository,
} from '../src/infrastructure/persistence/in-memory.repositories';
import { FlightCatalogClient } from '../src/domain/ports';


const departure = new Date(Date.now() + 5 * 3600e3);
const flight: FlightDto = {
  id: 'SA0100-TEST',
  flightNumber: 'SA0100',
  airline: 'SkyAndes Airlines',
  origin: 'BOG',
  destination: 'MDE',
  departureTime: departure.toISOString(),
  arrivalTime: new Date(departure.getTime() + 55 * 60000).toISOString(),
  durationMinutes: 55,
  status: FlightStatus.SCHEDULED,
  aircraft: 'Airbus A320',
  fares: [],
  availability: { total: 4, available: 3, locked: 0, occupied: 1 },
};

const catalog: FlightCatalogClient = {
  listFlights: async () => [flight],
  getSeatStates: async () => [
    { seatNumber: '1A', status: SeatStatus.OCCUPIED },
    { seatNumber: '1C', status: SeatStatus.AVAILABLE },
    { seatNumber: '1D', status: SeatStatus.AVAILABLE },
    { seatNumber: '1F', status: SeatStatus.AVAILABLE },
  ],
};

async function setup() {
  const broker = new InMemoryBroker();
  const bus = new InMemoryEventBus('flight-management-service', broker);
  const monolith = new InMemoryEventBus('monolith', broker);
  const c = compose(
    {
      flights: new InMemoryManagedFlightRepository(),
      history: new InMemoryStatusHistoryRepository(),
      occupancy: new InMemoryOccupancyRepository(),
      syncLog: new InMemorySyncLogRepository(),
      catalog,
    },
    bus,
    { jwtSecret: 'test-secret-key-1234567890', jwtExpiresIn: '1h', syncDaysAhead: 10 },
  );
  await c.syncFlights.execute();
  const app = createHttpApp(c.router, { httpLogs: false, service: 'fms' });
  const admin = c.jwt.sign({ sub: 'admin-1', email: 'admin@skyandes.com', role: UserRole.ADMIN, name: 'Admin' });
  const customer = c.jwt.sign({ sub: 'u-1', email: 'c@x.com', role: UserRole.CUSTOMER, name: 'C' });
  return { app, c, bus, monolith, broker, admin, customer };
}

describe('Flight Management Service', () => {
  it('HU4: el dashboard reacciona a SeatLocked, SeatReleased y ReservationConfirmed al instante', async () => {
    const { app, c, bus, monolith, broker } = await setup();
    const initial = await request(app).get(`/api/v1/dashboard/flights/${flight.id}/occupancy`);
    expect(initial.body.data).toMatchObject({ total: 4, available: 3, locked: 0, occupied: 1, occupancyRate: 25 });

    const live = firstValueFrom(c.dashboard.updates$.pipe(take(3), toArray()));

    await monolith.publish(EventTypes.SeatLocked, flight.id, {
      flightId: flight.id, seatNumber: '1C', reservationId: 'r1', userId: 'u1', price: 1, currency: 'COP', expiresAt: new Date().toISOString(),
    });
    // Evento duplicado (entrega al-menos-una-vez de Kafka): no debe alterar la proyección
    await monolith.publish(EventTypes.SeatLocked, flight.id, {
      flightId: flight.id, seatNumber: '1C', reservationId: 'r1', userId: 'u1', price: 1, currency: 'COP', expiresAt: new Date().toISOString(),
    });
    await broker.drain();
    let o = await request(app).get(`/api/v1/dashboard/flights/${flight.id}/occupancy`);
    expect(o.body.data).toMatchObject({ available: 2, locked: 1, occupied: 1 });

    await monolith.publish(EventTypes.SeatReleased, flight.id, { flightId: flight.id, seatNumber: '1C', reservationId: 'r1', reason: 'EXPIRED' as any });
    await broker.drain();
    o = await request(app).get(`/api/v1/dashboard/flights/${flight.id}/occupancy`);
    expect(o.body.data).toMatchObject({ available: 3, locked: 0 });

    const updates = await live;
    expect(updates.map((u) => u.locked)).toEqual([1, 1, 0]);
    expect(bus.published.filter((e) => e.type === EventTypes.FlightOccupancyUpdated)).toHaveLength(3);
  });

  it('marca el vuelo como SOLD_OUT cuando se ocupan todos los asientos y publica FlightStatusChanged', async () => {
    const { app, bus, monolith, broker } = await setup();
    await request(app).get(`/api/v1/dashboard/flights/${flight.id}/occupancy`);
    for (const seat of ['1C', '1D', '1F']) {
      await monolith.publish(EventTypes.ReservationConfirmed, flight.id, {
        reservationId: `r-${seat}`, reservationCode: 'ABC234', flightId: flight.id, flightNumber: 'SA0100', seatNumber: seat,
        userId: 'u', customerId: 'c', paymentId: 'p', price: 1, currency: 'COP', confirmedAt: new Date().toISOString(),
      });
    }
    await broker.drain();
    const statusEvent = bus.published.find((e) => e.type === EventTypes.FlightStatusChanged);
    expect(statusEvent?.payload).toMatchObject({ newStatus: FlightStatus.SOLD_OUT, changedBy: 'system' });
    const f = await request(app).get(`/api/v1/flights/${flight.id}`);
    expect(f.body.data.status).toBe(FlightStatus.SOLD_OUT);
  });

  it('cambios/cancelaciones: solo ADMIN, valida transiciones y publica FlightStatusChanged', async () => {
    const { app, bus, admin, customer } = await setup();
    const forbidden = await request(app).patch(`/api/v1/flights/${flight.id}/status`).set('Authorization', `Bearer ${customer}`).send({ status: 'CANCELLED' });
    expect(forbidden.status).toBe(403);

    const invalid = await request(app).patch(`/api/v1/flights/${flight.id}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'DELAYED' });
    expect(invalid.status).toBe(422); // falta delayMinutes

    const delayed = await request(app).patch(`/api/v1/flights/${flight.id}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'DELAYED', delayMinutes: 45, reason: 'Clima' });
    expect(delayed.status).toBe(200);
    expect(delayed.body.data).toMatchObject({ status: 'DELAYED', delayMinutes: 45 });

    const cancelled = await request(app).patch(`/api/v1/flights/${flight.id}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'CANCELLED' });
    expect(cancelled.status).toBe(200);
    const back = await request(app).patch(`/api/v1/flights/${flight.id}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'SCHEDULED' });
    expect(back.status).toBe(409);

    expect(bus.published.filter((e) => e.type === EventTypes.FlightStatusChanged).map((e: any) => e.payload.newStatus)).toEqual(['DELAYED', 'CANCELLED']);
    const history = await request(app).get(`/api/v1/flights/${flight.id}/status-history`);
    expect(history.body.data).toHaveLength(2);
  });

  it('sincronización con aerolíneas (feed GDS) y vista general del dashboard', async () => {
    const { app, admin } = await setup();
    const sync = await request(app).post('/api/v1/airlines/sync').set('Authorization', `Bearer ${admin}`).send({
      updates: [{ flightId: flight.id, status: 'DELAYED', delayMinutes: 30 }],
    });
    expect(sync.body.data.applied).toBe(1);
    const overview = await request(app).get('/api/v1/dashboard/overview');
    expect(overview.body.data).toMatchObject({ totalFlights: 1, totalSeats: 4, occupied: 1 });
  });
});
