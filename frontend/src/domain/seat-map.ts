import {
  ReservationConfirmedPayload,
  SeatAvailabilityDto,
  SeatDto,
  SeatLockedPayload,
  SeatMapDto,
  SeatReleaseReason,
  SeatReleasedPayload,
  SeatStatus,
} from '@reservas-vuelos/shared';

/**
 * Lógica pura del mapa de asientos (sin React ni red):
 * aplica los eventos de tiempo real sobre el estado local de forma idempotente.
 */

export type SeatEvent =
  | { type: 'locked'; payload: SeatLockedPayload }
  | { type: 'released'; payload: SeatReleasedPayload }
  | { type: 'occupied'; payload: ReservationConfirmedPayload };

export function summarize(seats: SeatDto[]): SeatAvailabilityDto {
  const summary: SeatAvailabilityDto = { total: seats.length, available: 0, locked: 0, occupied: 0 };
  for (const s of seats) {
    if (s.status === SeatStatus.AVAILABLE) summary.available++;
    else if (s.status === SeatStatus.LOCKED) summary.locked++;
    else summary.occupied++;
  }
  return summary;
}

/**
 * Asiento en el estado local: recuerda qué reserva lo bloqueó (dato que llega en SeatLocked)
 * para ignorar un SeatReleased tardío de un bloqueo anterior.
 */
type LiveSeat = SeatDto & { lockReservationId?: string | null };

/**
 * Motivos por los que el backend libera un asiento YA vendido (reembolso o vuelo cancelado).
 * EXPIRED / USER_CANCELLED solo aplican a bloqueos temporales.
 */
const RELEASES_OCCUPIED: ReadonlySet<SeatReleaseReason> = new Set([
  SeatReleaseReason.PAYMENT_REFUNDED,
  SeatReleaseReason.FLIGHT_CANCELLED,
]);

function toAvailable(seat: LiveSeat): LiveSeat {
  return { ...seat, status: SeatStatus.AVAILABLE, lockExpiresAt: null, lockedByMe: false, lockReservationId: null };
}

function transition(seat: LiveSeat, event: SeatEvent, currentUserId?: string): LiveSeat {
  switch (event.type) {
    case 'locked':
      // Un asiento vendido no vuelve a bloqueado por un evento desordenado
      if (seat.status === SeatStatus.OCCUPIED) return seat;
      return {
        ...seat,
        status: SeatStatus.LOCKED,
        lockExpiresAt: event.payload.expiresAt,
        lockedByMe: !!currentUserId && event.payload.userId === currentUserId,
        lockReservationId: event.payload.reservationId,
      };
    case 'released': {
      const { reason, reservationId } = event.payload;
      if (seat.status === SeatStatus.OCCUPIED) return RELEASES_OCCUPIED.has(reason) ? toAvailable(seat) : seat;
      if (seat.status !== SeatStatus.LOCKED) return seat;
      // SeatReleased tardío de otra reserva: el asiento ya fue bloqueado de nuevo por alguien más
      if (seat.lockReservationId && seat.lockReservationId !== reservationId) return seat;
      return toAvailable(seat);
    }
    case 'occupied':
      return { ...seat, status: SeatStatus.OCCUPIED, lockExpiresAt: null, lockedByMe: false, lockReservationId: null };
  }
}

/** Devuelve un nuevo mapa con el evento aplicado; si el evento no aplica, devuelve la misma referencia. */
export function applySeatEvent(map: SeatMapDto, event: SeatEvent, currentUserId?: string): SeatMapDto {
  if (event.payload.flightId !== map.flightId) return map;
  const seatNumber = event.payload.seatNumber.toUpperCase();
  let changed = false;
  const seats = map.seats.map((seat) => {
    if (seat.seatNumber !== seatNumber) return seat;
    const next = transition(seat, event, currentUserId);
    if (next !== seat) changed = true;
    return next;
  });
  if (!changed) return map;
  return { ...map, seats, summary: summarize(seats) };
}

/** Reemplaza un asiento (p. ej. tras consultar GET /flights/:id/seats/:seat). */
export function replaceSeat(map: SeatMapDto, updated: SeatDto): SeatMapDto {
  const seats = map.seats.map((s) => (s.seatNumber === updated.seatNumber ? { ...s, ...updated } : s));
  return { ...map, seats, summary: summarize(seats) };
}

export function isSelectable(seat: SeatDto): boolean {
  return seat.status === SeatStatus.AVAILABLE || (seat.status === SeatStatus.LOCKED && !!seat.lockedByMe);
}

/* ------------------------------------------------------------------ */
/* Distribución visual de la cabina                                    */
/* ------------------------------------------------------------------ */

export interface SeatRow {
  row: number;
  cabinClass: SeatDto['cabinClass'];
  /** Una celda por columna del avión (null = no existe asiento en esa columna para esta fila) */
  cells: (SeatDto | null)[];
}

export interface CabinLayout {
  columns: string[];
  /** Índices de columna después de los cuales va un pasillo */
  aisleAfter: number[];
  rows: SeatRow[];
}

/**
 * Pasillos: 3-3-3 para aviones de fuselaje ancho (9 columnas), 3-3 para 6 columnas,
 * 2-2 para 4 columnas; en general, se divide en bloques de 3 o por la mitad.
 */
export function aislePositions(columnCount: number): number[] {
  if (columnCount <= 3) return [];
  if (columnCount % 3 === 0) {
    const out: number[] = [];
    for (let i = 3; i < columnCount; i += 3) out.push(i - 1);
    return out;
  }
  return [Math.ceil(columnCount / 2) - 1];
}

export function buildCabinLayout(map: SeatMapDto): CabinLayout {
  const columns = [...map.columns].sort();
  const byRow = new Map<number, SeatDto[]>();
  for (const seat of map.seats) {
    const list = byRow.get(seat.row) ?? [];
    list.push(seat);
    byRow.set(seat.row, list);
  }
  const rows: SeatRow[] = [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, seats]) => ({
      row,
      cabinClass: seats[0].cabinClass,
      cells: columns.map((c) => seats.find((s) => s.column === c) ?? null),
    }));
  return { columns, aisleAfter: aislePositions(columns.length), rows };
}
