import { Clock } from '../src/shared/application/clock.port';
import { composeModules, inMemoryInfrastructure } from '../src/container';
import { createHttpApp } from '../src/app';
import { InMemoryBroker, InMemoryEventBus } from '../src/shared/infrastructure/messaging/in-memory-event-bus';
import { buildSeedDataset } from '../src/database/seed/seed-data';
import { FlightStatus } from '@reservas-vuelos/shared';

export class FakeClock implements Clock {
  constructor(public current = new Date()) {}
  now() {
    return new Date(this.current);
  }
  advanceMinutes(m: number) {
    this.current = new Date(this.current.getTime() + m * 60000);
  }
}

export function buildTestMonolith() {
  const clock = new FakeClock();
  const broker = new InMemoryBroker();
  const bus = new InMemoryEventBus('monolith', broker);
  const external = new InMemoryEventBus('payment-service', broker); // simula otro microservicio
  const infra = inMemoryInfrastructure(clock);

  const data = buildSeedDataset(clock.now(), 3);
  // Vuelo futuro BOG->MDE programado, sin ocupación, para las pruebas
  const flight = data.flights.find(
    (f) => f.originCode === 'BOG' && f.destinationCode === 'MDE' && f.status === FlightStatus.SCHEDULED && f.departureTime > new Date(clock.now().getTime() + 24 * 3600e3),
  )!;
  infra.flights.add(...data.flights.filter((f) => f.routeId === 'BOG-MDE'));
  infra.catalog.airports = data.airports;
  infra.catalog.routes = data.routes;
  infra.catalog.aircraft = data.aircraft;
  infra.seats.add(...data.seats.filter((s) => s.flightId === flight.id).map((s) => ({ ...s, status: 'AVAILABLE' as any, occupiedByReservationId: null })));

  const modules = composeModules(infra, bus, {
    jwtSecret: 'test-secret-key-1234567890',
    jwtExpiresIn: '1h',
    internalApiKey: 'internal',
    seatLockMinutes: 7,
    maxActiveHoldsPerUser: 4,
    sweepPeriodMs: 1000,
  });
  const app = createHttpApp(modules, { httpLogs: false });
  return { app, modules, bus, external, broker, clock, infra, flight, data };
}
