import {
  CabinClass,
  FlightDto,
  FlightOccupancyDto,
  FlightStatus,
  FlightStatusChangedPayload,
} from '@reservas-vuelos/shared';

/** Estados en los que el vuelo admite nuevas reservas. */
const BOOKABLE: ReadonlySet<FlightStatus> = new Set([FlightStatus.SCHEDULED, FlightStatus.DELAYED, FlightStatus.BOARDING]);

export function isBookable(flight: Pick<FlightDto, 'status' | 'availability'>): boolean {
  return BOOKABLE.has(flight.status) && flight.availability.available > 0;
}

export function lowestFare(flight: FlightDto, cabin?: CabinClass): { price: number; currency: string } | null {
  const fares = cabin ? flight.fares.filter((f) => f.cabinClass === cabin) : flight.fares;
  if (fares.length === 0) return null;
  const min = fares.reduce((a, b) => (b.price < a.price ? b : a));
  return { price: min.price, currency: min.currency };
}

/** HU1 regla de tiempo real: aplica un cambio de estado a la lista de resultados sin recargar. */
export function applyFlightStatusChange<T extends Pick<FlightDto, 'id' | 'status' | 'delayMinutes'>>(
  flights: T[],
  change: FlightStatusChangedPayload,
): T[] {
  let changed = false;
  const next = flights.map((f) => {
    if (f.id !== change.flightId) return f;
    changed = true;
    return {
      ...f,
      status: change.newStatus,
      delayMinutes: change.newStatus === FlightStatus.DELAYED ? change.delayMinutes : undefined,
    };
  });
  return changed ? next : flights;
}

/** Actualiza la disponibilidad de un vuelo de la lista con la ocupación proyectada por el FMS. */
export function applyOccupancyToFlights(flights: FlightDto[], occ: FlightOccupancyDto): FlightDto[] {
  let changed = false;
  const next = flights.map((f) => {
    if (f.id !== occ.flightId) return f;
    changed = true;
    return {
      ...f,
      status: occ.status ?? f.status,
      availability: { total: occ.total, available: occ.available, locked: occ.locked, occupied: occ.occupied },
    };
  });
  return changed ? next : flights;
}

export type FlightSort = 'departure' | 'price' | 'duration';

export function sortFlights(flights: FlightDto[], sort: FlightSort): FlightDto[] {
  const copy = [...flights];
  switch (sort) {
    case 'price':
      return copy.sort((a, b) => (lowestFare(a)?.price ?? Infinity) - (lowestFare(b)?.price ?? Infinity));
    case 'duration':
      return copy.sort((a, b) => a.durationMinutes - b.durationMinutes);
    default:
      return copy.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }
}

/**
 * Transiciones permitidas (espejo de la regla de dominio del Flight Management Service).
 * La UI solo la usa para ofrecer opciones válidas; el FMS sigue siendo la fuente de verdad.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<FlightStatus, FlightStatus[]> = {
  [FlightStatus.SCHEDULED]: [FlightStatus.DELAYED, FlightStatus.CANCELLED, FlightStatus.BOARDING, FlightStatus.SOLD_OUT],
  [FlightStatus.DELAYED]: [FlightStatus.DELAYED, FlightStatus.SCHEDULED, FlightStatus.CANCELLED, FlightStatus.BOARDING, FlightStatus.SOLD_OUT],
  [FlightStatus.SOLD_OUT]: [FlightStatus.SCHEDULED, FlightStatus.DELAYED, FlightStatus.CANCELLED, FlightStatus.BOARDING],
  [FlightStatus.BOARDING]: [FlightStatus.DEPARTED, FlightStatus.DELAYED, FlightStatus.CANCELLED],
  [FlightStatus.DEPARTED]: [FlightStatus.ARRIVED],
  [FlightStatus.CANCELLED]: [],
  [FlightStatus.ARRIVED]: [],
};
