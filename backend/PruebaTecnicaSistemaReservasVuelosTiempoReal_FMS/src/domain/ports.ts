import { FlightDto, FlightStatus, SeatStatus } from '@reservas-vuelos/shared';
import { ManagedFlight, StatusChange } from './managed-flight';
import { FlightOccupancy } from './occupancy';

export interface ManagedFlightRepository {
  upsertMany(flights: Omit<ManagedFlight, 'updatedAt'>[]): Promise<number>;
  findById(id: string): Promise<ManagedFlight | null>;
  list(filter: { from?: Date; to?: Date; status?: FlightStatus; origin?: string; destination?: string }): Promise<ManagedFlight[]>;
  /** Actualización condicional (optimistic concurrency) sobre el estado esperado. */
  updateStatus(id: string, expected: FlightStatus, status: FlightStatus, delayMinutes?: number): Promise<ManagedFlight | null>;
}

export interface StatusHistoryRepository {
  add(change: StatusChange): Promise<void>;
  findByFlight(flightId: string): Promise<StatusChange[]>;
}

export interface SyncLogRepository {
  add(entry: { type: 'CATALOG' | 'AIRLINE'; flights: number; changes: number; details?: unknown; at: Date }): Promise<void>;
  last(limit: number): Promise<unknown[]>;
}

export interface OccupancyRepository {
  findById(flightId: string): Promise<FlightOccupancy | null>;
  save(o: FlightOccupancy): Promise<void>;
  /** Aplica atómicamente el nuevo estado de un asiento y recalcula los contadores. */
  applySeatState(flightId: string, seatNumber: string, status: SeatStatus, at: Date): Promise<FlightOccupancy | null>;
  setFlightStatus(flightId: string, status: FlightStatus): Promise<void>;
  list(filter: { from?: Date; to?: Date }): Promise<FlightOccupancy[]>;
}

/** Puerto de salida hacia el monolito (catálogo de vuelos y estado de asientos). */
export interface FlightCatalogClient {
  listFlights(from: Date, to: Date): Promise<FlightDto[]>;
  getSeatStates(flightId: string): Promise<{ seatNumber: string; status: SeatStatus }[]>;
}
