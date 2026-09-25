import { FlightOccupancyDto, FlightStatusChangedPayload } from '@reservas-vuelos/shared';

/** Inserta o reemplaza la ocupación de un vuelo en una lista (dashboard), conservando el orden. */
export function upsertOccupancy(list: FlightOccupancyDto[], occ: FlightOccupancyDto): FlightOccupancyDto[] {
  const idx = list.findIndex((o) => o.flightId === occ.flightId);
  if (idx === -1) return list;
  const current = list[idx];
  // Descarta proyecciones más antiguas que la que ya tenemos
  if (current.updatedAt && occ.updatedAt && occ.updatedAt < current.updatedAt) return list;
  const next = [...list];
  next[idx] = occ;
  return next;
}

export function applyStatusToOccupancy(list: FlightOccupancyDto[], change: FlightStatusChangedPayload): FlightOccupancyDto[] {
  const idx = list.findIndex((o) => o.flightId === change.flightId);
  if (idx === -1) return list;
  const next = [...list];
  next[idx] = { ...next[idx], status: change.newStatus };
  return next;
}

export interface OccupancyTotals {
  total: number;
  available: number;
  locked: number;
  occupied: number;
  occupancyRate: number;
}

export function totalsOf(list: Pick<FlightOccupancyDto, 'total' | 'available' | 'locked' | 'occupied'>[]): OccupancyTotals {
  const t = list.reduce(
    (acc, o) => ({
      total: acc.total + o.total,
      available: acc.available + o.available,
      locked: acc.locked + o.locked,
      occupied: acc.occupied + o.occupied,
    }),
    { total: 0, available: 0, locked: 0, occupied: 0 },
  );
  return { ...t, occupancyRate: t.total ? Math.round((t.occupied / t.total) * 10000) / 100 : 0 };
}

/** Porcentajes para la barra apilada (siempre suman 100 cuando hay asientos). */
export function occupancyShares(o: Pick<OccupancyTotals, 'total' | 'available' | 'locked' | 'occupied'>) {
  if (!o.total) return { occupied: 0, locked: 0, available: 0 };
  const occupied = (o.occupied / o.total) * 100;
  const locked = (o.locked / o.total) * 100;
  return { occupied, locked, available: Math.max(0, 100 - occupied - locked) };
}
