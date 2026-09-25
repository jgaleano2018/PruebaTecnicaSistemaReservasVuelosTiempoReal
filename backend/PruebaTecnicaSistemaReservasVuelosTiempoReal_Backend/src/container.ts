import { Clock, systemClock } from './shared/application/clock.port';
import { EventBus } from './shared/application/event-bus.port';
import { JwtService } from './shared/infrastructure/auth/jwt';
import { CatalogRepository, FlightRepository } from './modules/flight/domain/flight.ports';
import { ReservationRepository, SeatRepository } from './modules/reservation/domain/reservation.ports';
import { CustomerRepository } from './modules/customer/domain/customer';
import { PasswordHasher, UserRepository } from './modules/auth/domain/user';
import { AnalyticsReadModel } from './modules/analytics/domain/analytics.ports';
import { MongoCatalogRepository, MongoFlightRepository } from './modules/flight/infrastructure/persistence/mongo-flight.repository';
import {
  InMemoryCatalogRepository,
  InMemoryFlightRepository,
} from './modules/flight/infrastructure/persistence/in-memory-flight.repository';
import {
  MongoReservationRepository,
  MongoSeatRepository,
} from './modules/reservation/infrastructure/persistence/mongo-reservation.repositories';
import {
  InMemoryReservationRepository,
  InMemorySeatRepository,
} from './modules/reservation/infrastructure/persistence/in-memory-reservation.repositories';
import { InMemoryCustomerRepository, MongoCustomerRepository } from './modules/customer/infrastructure/persistence/customer.persistence';
import {
  BcryptPasswordHasher,
  InMemoryUserRepository,
  MongoUserRepository,
} from './modules/auth/infrastructure/persistence/user.persistence';
import { MongoAnalyticsReadModel } from './modules/analytics/infrastructure/persistence/mongo-analytics.read-model';
import { InMemoryAnalyticsReadModel } from './modules/analytics/infrastructure/persistence/in-memory-analytics.read-model';
import { createAuthModule } from './modules/auth/auth.module';
import { createFlightModule } from './modules/flight/flight.module';
import { createReservationModule } from './modules/reservation/reservation.module';
import { createCustomerModule } from './modules/customer/customer.module';
import { createRealtimeModule } from './modules/realtime/realtime.module';
import { createAnalyticsModule } from './modules/analytics/analytics.module';
import { toReservationDto } from './modules/reservation/application/reservation-query.use-cases';

/** Adaptadores de salida (driven) que necesita el monolito. */
export interface Infrastructure {
  flights: FlightRepository;
  catalog: CatalogRepository;
  seats: SeatRepository;
  reservations: ReservationRepository;
  customers: CustomerRepository;
  users: UserRepository;
  hasher: PasswordHasher;
  analytics: AnalyticsReadModel;
  clock: Clock;
}

export function mongoInfrastructure(): Infrastructure {
  return {
    flights: new MongoFlightRepository(),
    catalog: new MongoCatalogRepository(),
    seats: new MongoSeatRepository(),
    reservations: new MongoReservationRepository(),
    customers: new MongoCustomerRepository(),
    users: new MongoUserRepository(),
    hasher: new BcryptPasswordHasher(),
    analytics: new MongoAnalyticsReadModel(),
    clock: systemClock,
  };
}

export function inMemoryInfrastructure(clock: Clock = systemClock) {
  const reservations = new InMemoryReservationRepository();
  return {
    flights: new InMemoryFlightRepository(),
    catalog: new InMemoryCatalogRepository(),
    seats: new InMemorySeatRepository(),
    reservations,
    customers: new InMemoryCustomerRepository(),
    users: new InMemoryUserRepository(),
    hasher: new BcryptPasswordHasher(),
    analytics: new InMemoryAnalyticsReadModel(reservations),
    clock,
  };
}

export interface AppConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  internalApiKey: string;
  seatLockMinutes: number;
  maxActiveHoldsPerUser: number;
  sweepPeriodMs: number;
}

/** Composition root: ensambla los módulos del monolito y sus puertos. */
export function composeModules(infra: Infrastructure, bus: EventBus, cfg: AppConfig) {
  const jwt = new JwtService(cfg.jwtSecret, cfg.jwtExpiresIn);

  const auth = createAuthModule({ users: infra.users, hasher: infra.hasher, jwt });

  const customer = createCustomerModule({
    customers: infra.customers,
    jwt,
    history: { findByCustomer: async (id) => (await infra.reservations.findByCustomer(id)).map(toReservationDto) },
  });

  const reservation = createReservationModule({
    seats: infra.seats,
    reservations: infra.reservations,
    flights: { getFlight: (id) => infra.flights.findById(id) },
    customers: customer.api.registry,
    bus,
    clock: infra.clock,
    jwt,
    internalApiKey: cfg.internalApiKey,
    holdConfig: { lockMinutes: cfg.seatLockMinutes, maxActiveHoldsPerUser: cfg.maxActiveHoldsPerUser },
    sweepPeriodMs: cfg.sweepPeriodMs,
  });

  const flight = createFlightModule({
    flights: infra.flights,
    catalog: infra.catalog,
    seatAvailability: reservation.api.seatAvailability,
    bus,
    internalApiKey: cfg.internalApiKey,
  });

  const realtime = createRealtimeModule(bus);
  const analytics = createAnalyticsModule({ readModel: infra.analytics, seats: reservation.api.seatAvailability, jwt });

  return { jwt, auth, customer, reservation, flight, realtime, analytics };
}

export type Modules = ReturnType<typeof composeModules>;
