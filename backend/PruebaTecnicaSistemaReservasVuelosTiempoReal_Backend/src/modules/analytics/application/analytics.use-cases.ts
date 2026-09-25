import { DemandReportDto, ReservationStatus } from '@reservas-vuelos/shared';
import { NotFoundError } from '@reservas-vuelos/service-kernel';
import { SeatAvailabilityPort } from '../../flight/domain/flight.ports';
import { AnalyticsReadModel, FlightMetrics, SummaryReport } from '../domain/analytics.ports';

export class AnalyticsUseCases {
  constructor(
    private readonly readModel: AnalyticsReadModel,
    private readonly seats: SeatAvailabilityPort,
  ) {}

  /** Métricas en tiempo real de ocupación de un vuelo. */
  async flightMetrics(flightId: string): Promise<FlightMetrics> {
    const [availability, stats] = await Promise.all([
      this.seats.getAvailability([flightId]),
      this.readModel.reservationStatsByFlight(flightId),
    ]);
    const a = availability.get(flightId);
    if (!a || a.total === 0) throw new NotFoundError('Vuelo', flightId);
    const confirmed = stats.byStatus[ReservationStatus.CONFIRMED] ?? 0;
    const totalHolds = Object.values(stats.byStatus).reduce((s, n) => s + n, 0);
    return {
      flightId,
      ...a,
      occupancyRate: round((a.occupied / a.total) * 100),
      confirmedReservations: confirmed,
      pendingHolds: stats.byStatus[ReservationStatus.PENDING_PAYMENT] ?? 0,
      expiredHolds: stats.byStatus[ReservationStatus.EXPIRED] ?? 0,
      revenue: stats.revenue,
      currency: stats.currency,
      conversionRate: totalHolds ? round((confirmed / totalHolds) * 100) : 0,
    };
  }

  /** Demanda y estadísticas por ruta. */
  demand(from: Date, to: Date): Promise<DemandReportDto[]> {
    return this.readModel.demandByRoute(from, to);
  }

  /** Reporte general. */
  summary(): Promise<SummaryReport> {
    return this.readModel.summary();
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
