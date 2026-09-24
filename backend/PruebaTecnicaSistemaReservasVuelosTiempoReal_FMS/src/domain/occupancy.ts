import { FlightOccupancyDto, FlightStatus, SeatStatus } from '@reservas-vuelos/shared';

/**
 * Proyección (read model) de ocupación de un vuelo (colección `ocupacion_vuelos`).
 * Guarda el estado de cada asiento para que aplicar un evento sea idempotente:
 * procesar dos veces SeatLocked(12A) deja el mismo resultado.
 */
export interface FlightOccupancy {
  flightId: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: Date;
  status: FlightStatus;
  seats: Record<string, SeatStatus>;
  total: number;
  available: number;
  locked: number;
  occupied: number;
  updatedAt: Date;
}

export function recount(o: Pick<FlightOccupancy, 'seats'>): { total: number; available: number; locked: number; occupied: number } {
  const c = { total: 0, available: 0, locked: 0, occupied: 0 };
  for (const s of Object.values(o.seats)) {
    c.total++;
    if (s === SeatStatus.AVAILABLE) c.available++;
    else if (s === SeatStatus.LOCKED) c.locked++;
    else c.occupied++;
  }
  return c;
}

export function occupancyRate(o: { total: number; occupied: number }): number {
  return o.total ? Math.round((o.occupied / o.total) * 10000) / 100 : 0;
}

export function toOccupancyDto(o: FlightOccupancy): FlightOccupancyDto {
  return {
    flightId: o.flightId,
    flightNumber: o.flightNumber,
    origin: o.origin,
    destination: o.destination,
    departureTime: o.departureTime.toISOString(),
    status: o.status,
    total: o.total,
    available: o.available,
    locked: o.locked,
    occupied: o.occupied,
    occupancyRate: occupancyRate(o),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/** ¿El evento de ocupación implica que el vuelo se agotó o dejó de estarlo? */
export function soldOutTransition(o: FlightOccupancy): FlightStatus | null {
  const sellable = o.available + o.locked;
  if (sellable === 0 && [FlightStatus.SCHEDULED, FlightStatus.DELAYED].includes(o.status)) return FlightStatus.SOLD_OUT;
  if (o.available > 0 && o.status === FlightStatus.SOLD_OUT) return FlightStatus.SCHEDULED;
  return null;
}
