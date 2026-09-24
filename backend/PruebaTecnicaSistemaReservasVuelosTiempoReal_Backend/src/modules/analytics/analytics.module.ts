import { JwtService } from '@reservas-vuelos/service-kernel';
import { SeatAvailabilityPort } from '../flight/domain/flight.ports';
import { AnalyticsUseCases } from './application/analytics.use-cases';
import { AnalyticsReadModel } from './domain/analytics.ports';
import { buildAnalyticsRouter } from './infrastructure/http/analytics.routes';

/**
 * Módulo de Dashboard (Analytics): métricas, ocupación, demanda/estadísticas y reportes históricos.
 * El dashboard EN VIVO (HU4) lo sirve el Flight Management Service, alimentado por eventos Kafka.
 */
export function createAnalyticsModule(d: { readModel: AnalyticsReadModel; seats: SeatAvailabilityPort; jwt: JwtService }) {
  return { router: buildAnalyticsRouter(d.jwt, new AnalyticsUseCases(d.readModel, d.seats)) };
}
