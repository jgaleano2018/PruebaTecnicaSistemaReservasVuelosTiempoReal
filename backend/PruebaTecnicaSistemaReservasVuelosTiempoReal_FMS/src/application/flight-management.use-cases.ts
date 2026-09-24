import { AirportDto, EventTypes, FlightStatus, FlightStatusHistoryDto, UpdateFlightStatusInput } from '@reservas-vuelos/shared';
import { Clock } from '../shared/application/clock.port';
import { EventBus } from '../shared/application/event-bus.port';
import { ConflictError, NotFoundError } from '../shared/domain/errors';
import { assertTransition, ManagedFlight } from '../domain/managed-flight';
import { FlightCatalogClient, ManagedFlightRepository, OccupancyRepository, StatusHistoryRepository, SyncLogRepository } from '../domain/ports';

const code = (a: AirportDto | string) => (typeof a === 'string' ? a : a.code);

/** Sincroniza el catálogo de vuelos desde el monolito (fuente de verdad del inventario). */
export class SyncFlightsUseCase {
  constructor(
    private readonly catalog: FlightCatalogClient,
    private readonly flights: ManagedFlightRepository,
    private readonly syncLog: SyncLogRepository,
    private readonly clock: Clock,
    private readonly daysAhead: number,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const from = new Date(now.getTime() - 24 * 3600e3);
    const to = new Date(now.getTime() + this.daysAhead * 24 * 3600e3);
    const remote = await this.catalog.listFlights(from, to);
    const count = await this.flights.upsertMany(
      remote.map((f) => ({
        id: f.id,
        flightNumber: f.flightNumber,
        airline: f.airline,
        origin: code(f.origin),
        destination: code(f.destination),
        departureTime: new Date(f.departureTime),
        arrivalTime: new Date(f.arrivalTime),
        aircraft: f.aircraft,
        status: f.status,
        delayMinutes: f.delayMinutes,
        lastSyncedAt: now,
      })),
    );
    await this.syncLog.add({ type: 'CATALOG', flights: count, changes: 0, at: now });
    return count;
  }
}

/**
 * Cambios / cancelaciones / retrasos de vuelo (gestión avanzada).
 * Publica FlightStatusChanged -> Kafka -> (monolito actualiza búsqueda, Payment reembolsa si se cancela,
 * Realtime Gateway notifica a los clientes con la lista de resultados abierta).
 */
export class ChangeFlightStatusUseCase {
  constructor(
    private readonly flights: ManagedFlightRepository,
    private readonly history: StatusHistoryRepository,
    private readonly occupancy: OccupancyRepository,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(flightId: string, input: UpdateFlightStatusInput, changedBy: string): Promise<ManagedFlight> {
    const current = await this.flights.findById(flightId);
    if (!current) throw new NotFoundError('Vuelo', flightId);
    assertTransition(current.status, input.status);

    const delay = input.status === FlightStatus.DELAYED ? input.delayMinutes : undefined;
    const updated = await this.flights.updateStatus(flightId, current.status, input.status, delay);
    if (!updated) throw new ConflictError('CONCURRENT_UPDATE', 'El vuelo fue modificado simultáneamente, intente de nuevo');

    await this.history.add({
      flightId,
      previousStatus: current.status,
      newStatus: input.status,
      delayMinutes: delay,
      reason: input.reason,
      changedBy,
      changedAt: this.clock.now(),
    });
    await this.occupancy.setFlightStatus(flightId, input.status);

    await this.bus.publish(EventTypes.FlightStatusChanged, flightId, {
      flightId,
      flightNumber: current.flightNumber,
      previousStatus: current.status,
      newStatus: input.status,
      delayMinutes: delay,
      reason: input.reason,
      changedBy,
    });
    return updated;
  }
}

export class FlightQueries {
  constructor(
    private readonly flights: ManagedFlightRepository,
    private readonly history: StatusHistoryRepository,
  ) {}

  list(filter: Parameters<ManagedFlightRepository['list']>[0]) {
    return this.flights.list(filter);
  }

  async get(id: string) {
    const f = await this.flights.findById(id);
    if (!f) throw new NotFoundError('Vuelo', id);
    return f;
  }

  async statusHistory(id: string): Promise<FlightStatusHistoryDto[]> {
    return (await this.history.findByFlight(id)).map((h) => ({ ...h, changedAt: h.changedAt.toISOString() }));
  }
}

/**
 * Sincronización con aerolíneas / GDS (simulada): recibe novedades operativas
 * (retrasos, cancelaciones) y las aplica como cambios de estado.
 */
export class AirlineSyncUseCase {
  constructor(
    private readonly flights: ManagedFlightRepository,
    private readonly changeStatus: ChangeFlightStatusUseCase,
    private readonly syncLog: SyncLogRepository,
    private readonly clock: Clock,
    private readonly random: () => number = Math.random,
  ) {}

  async execute(
    updates?: Array<{ flightId: string; status: FlightStatus; delayMinutes?: number; reason?: string }>,
  ): Promise<{ applied: number; errors: Array<{ flightId: string; error: string }> }> {
    let feed = updates;
    if (!feed?.length) {
      // Simulación de un feed GDS: retrasa aleatoriamente hasta 2 vuelos programados de las próximas 24 h
      const now = this.clock.now();
      const candidates = await this.flights.list({
        from: now,
        to: new Date(now.getTime() + 24 * 3600e3),
        status: FlightStatus.SCHEDULED,
      });
      feed = candidates
        .sort(() => this.random() - 0.5)
        .slice(0, 2)
        .map((f) => ({
          flightId: f.id,
          status: FlightStatus.DELAYED,
          delayMinutes: 15 * (1 + Math.floor(this.random() * 6)),
          reason: 'Novedad operativa reportada por la aerolínea (GDS)',
        }));
    }
    let applied = 0;
    const errors: Array<{ flightId: string; error: string }> = [];
    for (const u of feed) {
      try {
        await this.changeStatus.execute(u.flightId, u, 'airline-sync');
        applied++;
      } catch (err: any) {
        errors.push({ flightId: u.flightId, error: err.message });
      }
    }
    await this.syncLog.add({ type: 'AIRLINE', flights: feed.length, changes: applied, details: errors, at: this.clock.now() });
    return { applied, errors };
  }
}
