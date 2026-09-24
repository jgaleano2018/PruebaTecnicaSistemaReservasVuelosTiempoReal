import { Router } from 'express';
import { EventBus } from '../../shared/application/event-bus.port';
import {
  ApplyFlightStatusChangeUseCase,
  GetCatalogUseCase,
  GetFlightUseCase,
  ListFlightsForSyncUseCase,
  SearchFlightsUseCase,
} from './application/flight.use-cases';
import { CatalogRepository, FlightRepository, SeatAvailabilityPort } from './domain/flight.ports';
import { buildFlightRouter } from './infrastructure/http/flight.routes';
import { registerFlightEventConsumers } from './infrastructure/messaging/flight-events.consumer';

export interface FlightModuleDeps {
  flights: FlightRepository;
  catalog: CatalogRepository;
  seatAvailability: SeatAvailabilityPort;
  bus: EventBus;
  internalApiKey: string;
}

/** Módulo de Vuelos (Flight): búsqueda y filtros, gestión, horarios/estados, rutas y aeropuertos. */
export function createFlightModule(d: FlightModuleDeps): { router: Router; api: { getFlight: GetFlightUseCase } } {
  const searchFlights = new SearchFlightsUseCase(d.flights, d.catalog, d.seatAvailability);
  const getFlight = new GetFlightUseCase(d.flights, d.catalog, d.seatAvailability);
  const listForSync = new ListFlightsForSyncUseCase(d.flights, d.seatAvailability);
  const catalog = new GetCatalogUseCase(d.catalog);
  registerFlightEventConsumers(d.bus, new ApplyFlightStatusChangeUseCase(d.flights));
  return {
    router: buildFlightRouter({ searchFlights, getFlight, listForSync, catalog, internalApiKey: d.internalApiKey }),
    api: { getFlight },
  };
}
