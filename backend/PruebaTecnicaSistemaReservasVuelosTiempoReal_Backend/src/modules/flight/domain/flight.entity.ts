import { CabinClass, FlightStatus } from '@reservas-vuelos/shared';

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

const NON_BOOKABLE: FlightStatus[] = [
  FlightStatus.CANCELLED,
  FlightStatus.DEPARTED,
  FlightStatus.ARRIVED,
  FlightStatus.SOLD_OUT,
];

/** Regla de dominio: un vuelo admite bloqueos/reservas si no está cancelado, agotado o ya salió. */
export function isBookable(flight: Pick<Flight, 'status' | 'departureTime'>, now: Date): boolean {
  return !NON_BOOKABLE.includes(flight.status) && flight.departureTime.getTime() > now.getTime();
}

/** Transiciones de estado permitidas (usadas por el Flight Management Service y validadas aquí). */
export const ALLOWED_STATUS_TRANSITIONS: Record<FlightStatus, FlightStatus[]> = {
  [FlightStatus.SCHEDULED]: [FlightStatus.DELAYED, FlightStatus.CANCELLED, FlightStatus.BOARDING, FlightStatus.SOLD_OUT],
  [FlightStatus.DELAYED]: [FlightStatus.DELAYED, FlightStatus.SCHEDULED, FlightStatus.CANCELLED, FlightStatus.BOARDING, FlightStatus.SOLD_OUT],
  [FlightStatus.SOLD_OUT]: [FlightStatus.SCHEDULED, FlightStatus.DELAYED, FlightStatus.CANCELLED, FlightStatus.BOARDING],
  [FlightStatus.BOARDING]: [FlightStatus.DEPARTED, FlightStatus.DELAYED, FlightStatus.CANCELLED],
  [FlightStatus.DEPARTED]: [FlightStatus.ARRIVED],
  [FlightStatus.CANCELLED]: [],
  [FlightStatus.ARRIVED]: [],
};
