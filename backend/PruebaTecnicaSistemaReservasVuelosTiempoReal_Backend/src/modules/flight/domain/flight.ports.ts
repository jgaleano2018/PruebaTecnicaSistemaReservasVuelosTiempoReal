import { FlightStatus, SeatAvailabilityDto } from '@reservas-vuelos/shared';
import { Aircraft, Airport, Flight, Route } from './flight.entity';

export interface FlightSearchCriteria {
  origin: string;
  destination: string;
  from: Date;
  to: Date;
}

/** Puerto de persistencia de vuelos (colección `vuelos`). */
export interface FlightRepository {
  findById(id: string): Promise<Flight | null>;
  search(criteria: FlightSearchCriteria): Promise<Flight[]>;
  findByDepartureRange(from: Date, to: Date): Promise<Flight[]>;
  updateStatus(id: string, status: FlightStatus, delayMinutes?: number): Promise<Flight | null>;
}

/** Puertos de catálogo (colecciones `aeropuertos`, `rutas`, `aviones`). */
export interface CatalogRepository {
  findAirports(): Promise<Airport[]>;
  findAirportsByCodes(codes: string[]): Promise<Airport[]>;
  findRoutes(): Promise<Route[]>;
  findAircraft(): Promise<Aircraft[]>;
  findAircraftById(id: string): Promise<Aircraft | null>;
}

/** Puerto implementado por el módulo de Reservas: disponibilidad de asientos por vuelo. */
export interface SeatAvailabilityPort {
  getAvailability(flightIds: string[]): Promise<Map<string, SeatAvailabilityDto>>;
}
