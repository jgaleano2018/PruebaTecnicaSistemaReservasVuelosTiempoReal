import { filter, map, merge, Observable, Subject } from 'rxjs';
import {
  DashboardOverviewDto,
  EventTypes,
  FlightOccupancyDto,
  FlightStatus,
  SeatStatus,
} from '@reservas-vuelos/shared';
import { Clock, EventBus, NotFoundError, logger } from '@reservas-vuelos/service-kernel';
import { FlightOccupancy, occupancyRate, recount, soldOutTransition, toOccupancyDto } from '../domain/occupancy';
import { FlightCatalogClient, ManagedFlightRepository, OccupancyRepository } from '../domain/ports';
import { ChangeFlightStatusUseCase } from './flight-management.use-cases';

/**
 * HU4 - Dashboard / Vista de Estado del Vuelo.
 * Proyección de ocupación alimentada por eventos Kafka (SeatLocked, SeatReleased, ReservationConfirmed).
 * Cada cambio se re-publica como FlightOccupancyUpdated (-> Realtime Gateway -> dashboards)
 * y además se expone como stream reactivo (SSE) desde este mismo servicio.
 */
export class DashboardService {
  private readonly updates = new Subject<FlightOccupancyDto>();
  readonly updates$: Observable<FlightOccupancyDto> = this.updates.asObservable();

  constructor(
    private readonly occupancy: OccupancyRepository,
    private readonly flights: ManagedFlightRepository,
    private readonly catalog: FlightCatalogClient,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    private changeStatus?: ChangeFlightStatusUseCase,
  ) {}

  setStatusChanger(c: ChangeFlightStatusUseCase) {
    this.changeStatus = c;
  }

  /** Obtiene o construye la proyección de un vuelo (inicialización perezosa desde el monolito). */
  async ensure(flightId: string): Promise<FlightOccupancy> {
    const existing = await this.occupancy.findById(flightId);
    if (existing) return existing;
    const flight = await this.flights.findById(flightId);
    if (!flight) throw new NotFoundError('Vuelo', flightId);
    const states = await this.catalog.getSeatStates(flightId);
    const seats = Object.fromEntries(states.map((s) => [s.seatNumber, s.status]));
    const o: FlightOccupancy = {
      flightId,
      flightNumber: flight.flightNumber,
      origin: flight.origin,
      destination: flight.destination,
      departureTime: flight.departureTime,
      status: flight.status,
      seats,
      ...recount({ seats }),
      updatedAt: this.clock.now(),
    };
    await this.occupancy.save(o);
    return o;
  }

  async getOccupancy(flightId: string): Promise<FlightOccupancyDto> {
    return toOccupancyDto(await this.ensure(flightId));
  }

  /** Aplica un evento de asiento a la proyección y emite la actualización en tiempo real. */
  async applySeatEvent(flightId: string, seatNumber: string, status: SeatStatus): Promise<FlightOccupancyDto | null> {
    const exists = await this.occupancy.findById(flightId);
    // Si no existe, se inicializa desde el monolito (que ya refleja el evento) => idempotente.
    const updated = exists
      ? await this.occupancy.applySeatState(flightId, seatNumber, status, this.clock.now())
      : await this.ensure(flightId).catch((err) => {
          logger.warn({ err: err.message, flightId }, 'No fue posible inicializar la proyección');
          return null;
        });
    if (!updated) return null;
    const dto = toOccupancyDto(updated);
    this.updates.next(dto);
    await this.bus.publish(EventTypes.FlightOccupancyUpdated, flightId, { occupancy: dto });

    const next = soldOutTransition(updated);
    if (next && this.changeStatus) {
      await this.changeStatus
        .execute(flightId, { status: next, reason: next === FlightStatus.SOLD_OUT ? 'Vuelo agotado' : 'Se liberaron asientos' }, 'system')
        .catch((err) => logger.warn({ err: err.message, flightId }, 'No se pudo cambiar estado por ocupación'));
    }
    return dto;
  }

  async onFlightStatusChanged(flightId: string, status: FlightStatus): Promise<void> {
    const o = await this.occupancy.findById(flightId);
    if (!o) return;
    const dto = { ...toOccupancyDto(o), status };
    this.updates.next(dto);
  }

  async listFlights(filterOpts: { from?: Date; to?: Date }): Promise<FlightOccupancyDto[]> {
    return (await this.occupancy.list(filterOpts)).map(toOccupancyDto);
  }

  /** Vista general: métricas agregadas de los vuelos próximos. */
  async overview(hoursAhead = 72): Promise<DashboardOverviewDto> {
    const now = this.clock.now();
    const to = new Date(now.getTime() + hoursAhead * 3600e3);
    const upcoming = await this.flights.list({ from: now, to });
    // Garantiza proyección para los vuelos próximos (máx. 60 para acotar la carga inicial)
    const projections: FlightOccupancy[] = [];
    for (const f of upcoming.slice(0, 60)) {
      const p = await this.ensure(f.id).catch(() => null);
      if (p) projections.push(p);
    }
    const totals = projections.reduce(
      (acc, p) => ({
        totalSeats: acc.totalSeats + p.total,
        available: acc.available + p.available,
        locked: acc.locked + p.locked,
        occupied: acc.occupied + p.occupied,
      }),
      { totalSeats: 0, available: 0, locked: 0, occupied: 0 },
    );
    const flightsByStatus: Record<string, number> = {};
    for (const f of upcoming) flightsByStatus[f.status] = (flightsByStatus[f.status] ?? 0) + 1;
    return {
      totalFlights: upcoming.length,
      ...totals,
      occupancyRate: occupancyRate({ total: totals.totalSeats, occupied: totals.occupied }),
      flightsByStatus,
      topFlights: projections
        .map(toOccupancyDto)
        .sort((a, b) => b.occupancyRate - a.occupancyRate)
        .slice(0, 10),
      updatedAt: now.toISOString(),
    };
  }

  /** Stream reactivo para SSE: `flightId` o todos. */
  stream(flightId?: string): Observable<{ event: string; data: FlightOccupancyDto; id?: string }> {
    return merge(this.updates$).pipe(
      filter((o) => !flightId || o.flightId === flightId),
      map((o) => ({ event: 'occupancy', data: o })),
    );
  }
}
