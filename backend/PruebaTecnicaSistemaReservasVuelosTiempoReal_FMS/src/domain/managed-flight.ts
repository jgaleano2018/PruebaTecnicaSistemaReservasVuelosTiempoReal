import { canTransitionFlightStatus, FLIGHT_STATUS_TRANSITIONS, FlightStatus } from '@reservas-vuelos/shared';
import { ConflictError } from '@reservas-vuelos/service-kernel';

/** Vuelo gestionado por el Flight Management Service (colección `vuelos_gestion` en flight-db). */
export interface ManagedFlight {
  id: string;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureTime: Date;
  arrivalTime: Date;
  aircraft: string;
  status: FlightStatus;
  delayMinutes?: number;
  lastSyncedAt: Date;
  updatedAt: Date;
}

export interface StatusChange {
  flightId: string;
  previousStatus: FlightStatus;
  newStatus: FlightStatus;
  delayMinutes?: number;
  reason?: string;
  changedBy: string;
  changedAt: Date;
}

/** Regla de dominio: valida la transición de estado del vuelo. */
export function assertTransition(from: FlightStatus, to: FlightStatus): void {
  if (!canTransitionFlightStatus(from, to)) {
    throw new ConflictError('INVALID_STATUS_TRANSITION', `No se puede pasar de ${from} a ${to}`, {
      allowed: FLIGHT_STATUS_TRANSITIONS[from],
    });
  }
}
