import {
  CabinClass,
  PassengerDto,
  ReservationStatus,
  SeatDto,
  SeatPosition,
  SeatStatus,
} from '@reservas-vuelos/shared';

/** Asiento de un vuelo (colección `asientos`). Es la unidad de concurrencia contra el double booking. */
export interface Seat {
  flightId: string;
  seatNumber: string;
  row: number;
  column: string;
  cabinClass: CabinClass;
  position: SeatPosition;
  price: number;
  currency: string;
  status: SeatStatus;
  lockedByReservationId?: string | null;
  lockedByUserId?: string | null;
  lockExpiresAt?: Date | null;
  occupiedByReservationId?: string | null;
}

/** Reserva (colección `reservas`). Nace como bloqueo temporal (PENDING_PAYMENT). */
export interface Reservation {
  id: string;
  reservationCode?: string;
  flightId: string;
  flightNumber: string;
  seatNumber: string;
  cabinClass: CabinClass;
  userId: string;
  customerId?: string;
  passenger?: PassengerDto;
  status: ReservationStatus;
  price: number;
  currency: string;
  holdExpiresAt: Date;
  paymentId?: string;
  failureReason?: string;
  createdAt: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
}

/**
 * Estado efectivo de un asiento: un bloqueo vencido se considera disponible
 * aunque el barrido de expiración todavía no lo haya liberado.
 */
export function effectiveSeatStatus(seat: Seat, now: Date): SeatStatus {
  if (seat.status === SeatStatus.LOCKED && seat.lockExpiresAt && seat.lockExpiresAt.getTime() <= now.getTime()) {
    return SeatStatus.AVAILABLE;
  }
  return seat.status;
}

export function toSeatDto(seat: Seat, now: Date, requesterId?: string): SeatDto {
  const status = effectiveSeatStatus(seat, now);
  const locked = status === SeatStatus.LOCKED;
  return {
    flightId: seat.flightId,
    seatNumber: seat.seatNumber,
    row: seat.row,
    column: seat.column,
    cabinClass: seat.cabinClass,
    position: seat.position,
    price: seat.price,
    currency: seat.currency,
    status,
    lockExpiresAt: locked && seat.lockExpiresAt ? seat.lockExpiresAt.toISOString() : null,
    lockedByMe: locked && !!requesterId && seat.lockedByUserId === requesterId,
  };
}

export const ACTIVE_HOLD_STATUSES = [ReservationStatus.PENDING_PAYMENT];

/** Genera un código de reserva (PNR) de 6 caracteres sin caracteres ambiguos. */
export function generateReservationCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(random() * alphabet.length)];
  return code;
}
