import { FlightStatus } from '@reservas-vuelos/shared';
import { Aircraft, Airport, Flight, Route } from '../../domain/flight.entity';
import { CatalogRepository, FlightRepository, FlightSearchCriteria } from '../../domain/flight.ports';

/** Adaptador en memoria (pruebas / modo demo). Demuestra la intercambiabilidad de la arquitectura hexagonal. */
export class InMemoryFlightRepository implements FlightRepository {
  constructor(private readonly flights = new Map<string, Flight>()) {}

  add(...flights: Flight[]): void {
    flights.forEach((f) => this.flights.set(f.id, { ...f }));
  }

  async findById(id: string) {
    const f = this.flights.get(id);
    return f ? { ...f } : null;
  }

  async search(c: FlightSearchCriteria) {
    return [...this.flights.values()].filter(
      (f) =>
        f.originCode === c.origin &&
        f.destinationCode === c.destination &&
        f.departureTime >= c.from &&
        f.departureTime < c.to,
    );
  }

  async findByDepartureRange(from: Date, to: Date) {
    return [...this.flights.values()].filter((f) => f.departureTime >= from && f.departureTime < to);
  }

  async updateStatus(id: string, status: FlightStatus, delayMinutes?: number) {
    const f = this.flights.get(id);
    if (!f) return null;
    f.status = status;
    f.delayMinutes = delayMinutes;
    return { ...f };
  }
}

export class InMemoryCatalogRepository implements CatalogRepository {
  constructor(
    public airports: Airport[] = [],
    public routes: Route[] = [],
    public aircraft: Aircraft[] = [],
  ) {}
  async findAirports() {
    return this.airports;
  }
  async findAirportsByCodes(codes: string[]) {
    return this.airports.filter((a) => codes.includes(a.code));
  }
  async findRoutes() {
    return this.routes;
  }
  async findAircraft() {
    return this.aircraft;
  }
  async findAircraftById(id: string) {
    return this.aircraft.find((a) => a.id === id) ?? null;
  }
}
