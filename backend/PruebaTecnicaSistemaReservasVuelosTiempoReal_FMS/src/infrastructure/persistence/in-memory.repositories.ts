import { FlightStatus, SeatStatus } from '@reservas-vuelos/shared';
import { ManagedFlight, StatusChange } from '../../domain/managed-flight';
import { FlightOccupancy, recount } from '../../domain/occupancy';
import { ManagedFlightRepository, OccupancyRepository, StatusHistoryRepository, SyncLogRepository } from '../../domain/ports';

export class InMemoryManagedFlightRepository implements ManagedFlightRepository {
  readonly items = new Map<string, ManagedFlight>();
  async upsertMany(flights: Omit<ManagedFlight, 'updatedAt'>[]) {
    for (const f of flights) {
      const cur = this.items.get(f.id);
      this.items.set(f.id, cur ? { ...cur, ...f, status: cur.status, delayMinutes: cur.delayMinutes, updatedAt: new Date() } : { ...f, updatedAt: new Date() });
    }
    return flights.length;
  }
  async findById(id: string) {
    const f = this.items.get(id);
    return f ? { ...f } : null;
  }
  async list(f: { from?: Date; to?: Date; status?: FlightStatus; origin?: string; destination?: string }) {
    return [...this.items.values()].filter(
      (x) =>
        (!f.from || x.departureTime >= f.from) &&
        (!f.to || x.departureTime < f.to) &&
        (!f.status || x.status === f.status) &&
        (!f.origin || x.origin === f.origin) &&
        (!f.destination || x.destination === f.destination),
    );
  }
  async updateStatus(id: string, expected: FlightStatus, status: FlightStatus, delayMinutes?: number) {
    const f = this.items.get(id);
    if (!f || f.status !== expected) return null;
    Object.assign(f, { status, delayMinutes, updatedAt: new Date() });
    return { ...f };
  }
}

export class InMemoryStatusHistoryRepository implements StatusHistoryRepository {
  readonly items: StatusChange[] = [];
  async add(c: StatusChange) {
    this.items.push(c);
  }
  async findByFlight(flightId: string) {
    return this.items.filter((c) => c.flightId === flightId).reverse();
  }
}

export class InMemorySyncLogRepository implements SyncLogRepository {
  readonly items: unknown[] = [];
  async add(e: unknown) {
    this.items.push(e);
  }
  async last(limit: number) {
    return this.items.slice(-limit).reverse();
  }
}

export class InMemoryOccupancyRepository implements OccupancyRepository {
  readonly items = new Map<string, FlightOccupancy>();
  async findById(id: string) {
    const o = this.items.get(id);
    return o ? { ...o, seats: { ...o.seats } } : null;
  }
  async save(o: FlightOccupancy) {
    this.items.set(o.flightId, { ...o, seats: { ...o.seats } });
  }
  async applySeatState(flightId: string, seatNumber: string, status: SeatStatus, at: Date) {
    const o = this.items.get(flightId);
    if (!o) return null;
    o.seats[seatNumber] = status;
    Object.assign(o, recount(o), { updatedAt: at });
    return { ...o, seats: { ...o.seats } };
  }
  async setFlightStatus(flightId: string, status: FlightStatus) {
    const o = this.items.get(flightId);
    if (o) o.status = status;
  }
  async list(f: { from?: Date; to?: Date }) {
    return [...this.items.values()].filter((o) => (!f.from || o.departureTime >= f.from) && (!f.to || o.departureTime < f.to));
  }
}
