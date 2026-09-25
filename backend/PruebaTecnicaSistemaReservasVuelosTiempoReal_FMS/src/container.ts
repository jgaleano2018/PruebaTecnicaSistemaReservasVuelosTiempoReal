import { filter } from 'rxjs';
import { EventTypes, FlightStatusChangedPayload } from '@reservas-vuelos/shared';
import { Clock, systemClock, EventBus, JwtService } from '@reservas-vuelos/service-kernel';
import { AirlineSyncUseCase, ChangeFlightStatusUseCase, FlightQueries, SyncFlightsUseCase } from './application/flight-management.use-cases';
import { DashboardService } from './application/dashboard.use-cases';
import { FlightCatalogClient, ManagedFlightRepository, OccupancyRepository, StatusHistoryRepository, SyncLogRepository } from './domain/ports';
import { registerConsumers } from './infrastructure/messaging/consumers';
import { buildRoutes } from './infrastructure/http/routes';

export interface Infrastructure {
  flights: ManagedFlightRepository;
  history: StatusHistoryRepository;
  occupancy: OccupancyRepository;
  syncLog: SyncLogRepository;
  catalog: FlightCatalogClient;
  clock?: Clock;
}

export function compose(infra: Infrastructure, bus: EventBus, cfg: { jwtSecret: string; jwtExpiresIn: string; syncDaysAhead: number }) {
  const clock = infra.clock ?? systemClock;
  const jwt = new JwtService(cfg.jwtSecret, cfg.jwtExpiresIn);
  const dashboard = new DashboardService(infra.occupancy, infra.flights, infra.catalog, bus, clock);
  const changeStatus = new ChangeFlightStatusUseCase(infra.flights, infra.history, infra.occupancy, bus, clock);
  dashboard.setStatusChanger(changeStatus);
  const syncFlights = new SyncFlightsUseCase(infra.catalog, infra.flights, infra.syncLog, clock, cfg.syncDaysAhead);
  const airlineSync = new AirlineSyncUseCase(infra.flights, changeStatus, infra.syncLog, clock);
  const queries = new FlightQueries(infra.flights, infra.history);

  registerConsumers(bus, dashboard);
  // Reacciona (RxJS) a los cambios de estado publicados por este servicio para refrescar los dashboards SSE.
  bus.events$
    .pipe(filter((e) => e.type === EventTypes.FlightStatusChanged))
    .subscribe((e) => {
      const p = e.payload as FlightStatusChangedPayload;
      void dashboard.onFlightStatusChanged(p.flightId, p.newStatus);
    });

  const router = buildRoutes({ jwt, queries, changeStatus, syncFlights, airlineSync, dashboard, syncLog: infra.syncLog });
  return { router, dashboard, changeStatus, syncFlights, airlineSync, jwt };
}

export type Composition = ReturnType<typeof compose>;
