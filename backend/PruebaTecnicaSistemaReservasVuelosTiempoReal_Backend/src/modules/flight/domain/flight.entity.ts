import { CabinClass, FlightStatus, NON_BOOKABLE_FLIGHT_STATUSES } from '@reservas-vuelos/shared';

export interface Fare {
  cabinClass: CabinClass;
  price: number;
  currency: string;
}

export interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  originCode: string;
  destinationCode: string;
  routeId: string;
  aircraftId: string;
  aircraftModel: string;
  departureTime: Date;
  arrivalTime: Date;
  durationMinutes: number;
  status: FlightStatus;
  delayMinutes?: number;
  fares: Fare[];
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export interface Route {
  id: string;
  origin: string;
  destination: string;
  distanceKm: number;
  durationMinutes: number;
}

export interface SeatLayoutSection {
  cabinClass: CabinClass;
  fromRow: number;
  toRow: number;
  columns: string[];
}

export interface Aircraft {
  id: string;
  model: string;
  registration: string;
  totalSeats: number;
  layout: SeatLayoutSection[];
}

/** Regla de dominio: un vuelo admite bloqueos/reservas si no está cancelado, agotado o ya salió. */
export function isBookable(flight: Pick<Flight, 'status' | 'departureTime'>, now: Date): boolean {
  return !NON_BOOKABLE_FLIGHT_STATUSES.includes(flight.status) && flight.departureTime.getTime() > now.getTime();
}
