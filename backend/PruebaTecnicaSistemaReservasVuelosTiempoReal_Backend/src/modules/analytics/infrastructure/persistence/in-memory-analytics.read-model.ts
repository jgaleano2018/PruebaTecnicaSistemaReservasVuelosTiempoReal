import { DemandReportDto, ReservationStatus } from '@reservas-vuelos/shared';
import { AnalyticsReadModel, SummaryReport } from '../../domain/analytics.ports';
import { InMemoryReservationRepository } from '../../../reservation/infrastructure/persistence/in-memory-reservation.repositories';

export class InMemoryAnalyticsReadModel implements AnalyticsReadModel {
  constructor(private readonly reservations: InMemoryReservationRepository) {}

  async reservationStatsByFlight(flightId: string) {
    const byStatus: Record<string, number> = {};
    let revenue = 0;
    for (const r of this.reservations.items.values()) {
      if (r.flightId !== flightId) continue;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.status === ReservationStatus.CONFIRMED) revenue += r.price;
    }
    return { byStatus, revenue, currency: 'COP' };
  }
  async demandByRoute(): Promise<DemandReportDto[]> {
    const map = new Map<string, DemandReportDto>();
    for (const r of this.reservations.items.values()) {
      if (r.status !== ReservationStatus.CONFIRMED) continue;
      const d = map.get(r.flightNumber) ?? { route: r.flightNumber, reservations: 0, revenue: 0, currency: r.currency };
      d.reservations++;
      d.revenue += r.price;
      map.set(r.flightNumber, d);
    }
    return [...map.values()];
  }
  async summary(): Promise<SummaryReport> {
    const reservationsByStatus: Record<string, number> = {};
    let revenue = 0;
    for (const r of this.reservations.items.values()) {
      reservationsByStatus[r.status] = (reservationsByStatus[r.status] ?? 0) + 1;
      if (r.status === ReservationStatus.CONFIRMED) revenue += r.price;
    }
    return {
      totalFlights: 0,
      confirmedReservations: reservationsByStatus[ReservationStatus.CONFIRMED] ?? 0,
      revenue,
      currency: 'COP',
      reservationsByStatus,
      flightsByStatus: {},
    };
  }
}
