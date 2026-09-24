import { DemandReportDto, SeatAvailabilityDto } from '@reservas-vuelos/shared';

export interface FlightMetrics extends SeatAvailabilityDto {
  flightId: string;
  occupancyRate: number;
  confirmedReservations: number;
  pendingHolds: number;
  expiredHolds: number;
  revenue: number;
  currency: string;
  /** holds que terminaron en compra / total de holds */
  conversionRate: number;
}

export interface SummaryReport {
  totalFlights: number;
  confirmedReservations: number;
  revenue: number;
  currency: string;
  reservationsByStatus: Record<string, number>;
  flightsByStatus: Record<string, number>;
}

/** Modelo de lectura para métricas, demanda y reportes (consultas de agregación). */
export interface AnalyticsReadModel {
  reservationStatsByFlight(flightId: string): Promise<{ byStatus: Record<string, number>; revenue: number; currency: string }>;
  demandByRoute(from: Date, to: Date): Promise<DemandReportDto[]>;
  summary(): Promise<SummaryReport>;
}
