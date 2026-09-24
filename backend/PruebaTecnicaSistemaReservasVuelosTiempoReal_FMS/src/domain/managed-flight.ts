import { FlightStatus } from '@reservas-vuelos/shared';
import { ConflictError } from '../shared/domain/errors';

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

export const ALLOWED_STATUS_TRANSITIONS: Record<FlightStatus, FlightStatus[]> = {
  [FlightStatus.SCHEDULED]: [FlightStatus.DELAYED, FlightStatus.CANCELLED, FlightStatus.BOARDING, FlightStatus.SOLD_OUT],
  [FlightStatus.DELAYED]: [FlightStatus.DELAYED, FlightStatus.SCHEDULED, FlightStatus.CANCELLED, FlightStatus.BOARDING, FlightStatus.SOLD_OUT],
  [FlightStatus.SOLD_OUT]: [FlightStatus.SCHEDULED, FlightStatus.DELAYED, FlightStatus.CANCELLED, FlightStatus.BOARDING],
  [FlightStatus.BOARDING]: [FlightStatus.DEPARTED, FlightStatus.DELAYED, FlightStatus.CANCELLED],
  [FlightStatus.DEPARTED]: [FlightStatus.ARRIVED],
  [FlightStatus.CANCELLED]: [],
  [FlightStatus.ARRIVED]: [],
};

/** Regla de dominio: valida la transición de estado del vuelo. */
export function assertTransition(from: FlightStatus, to: FlightStatus): void {
  if (!ALLOWED_STATUS_TRANSITIONS[from].includes(to)) {
    throw new ConflictError('INVALID_STATUS_TRANSITION', `No se puede pasar de ${from} a ${to}`, {
      allowed: ALLOWED_STATUS_TRANSITIONS[from],
    });
  }
}
