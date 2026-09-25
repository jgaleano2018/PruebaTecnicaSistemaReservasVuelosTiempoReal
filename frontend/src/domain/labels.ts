import {
  CabinClass,
  FlightStatus,
  PaymentStatus,
  ReservationStatus,
  SeatPosition,
  SeatReleaseReason,
  SeatStatus,
  UserRole,
} from '@reservas-vuelos/shared';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export const flightStatusLabel: Record<FlightStatus, { label: string; tone: Tone }> = {
  [FlightStatus.SCHEDULED]: { label: 'A tiempo', tone: 'success' },
  [FlightStatus.BOARDING]: { label: 'Abordando', tone: 'info' },
  [FlightStatus.DELAYED]: { label: 'Retrasado', tone: 'warning' },
  [FlightStatus.CANCELLED]: { label: 'Cancelado', tone: 'danger' },
  [FlightStatus.SOLD_OUT]: { label: 'Agotado', tone: 'neutral' },
  [FlightStatus.DEPARTED]: { label: 'Despegó', tone: 'neutral' },
  [FlightStatus.ARRIVED]: { label: 'Aterrizó', tone: 'neutral' },
};

export const seatStatusLabel: Record<SeatStatus, string> = {
  [SeatStatus.AVAILABLE]: 'Disponible',
  [SeatStatus.LOCKED]: 'Bloqueado temporalmente',
  [SeatStatus.OCCUPIED]: 'Ocupado',
};

export const seatPositionLabel: Record<SeatPosition, string> = {
  [SeatPosition.WINDOW]: 'Ventana',
  [SeatPosition.MIDDLE]: 'Centro',
  [SeatPosition.AISLE]: 'Pasillo',
};

export const cabinLabel: Record<CabinClass, string> = {
  [CabinClass.BUSINESS]: 'Business',
  [CabinClass.ECONOMY]: 'Economy',
};

export const reservationStatusLabel: Record<ReservationStatus, { label: string; tone: Tone }> = {
  [ReservationStatus.PENDING_PAYMENT]: { label: 'Pendiente de pago', tone: 'warning' },
  [ReservationStatus.CONFIRMED]: { label: 'Confirmada', tone: 'success' },
  [ReservationStatus.EXPIRED]: { label: 'Expirada', tone: 'neutral' },
  [ReservationStatus.CANCELLED]: { label: 'Cancelada', tone: 'danger' },
  [ReservationStatus.FAILED]: { label: 'Fallida', tone: 'danger' },
};

export const paymentStatusLabel: Record<PaymentStatus, { label: string; tone: Tone }> = {
  [PaymentStatus.PENDING]: { label: 'Pendiente', tone: 'warning' },
  [PaymentStatus.APPROVED]: { label: 'Aprobado', tone: 'success' },
  [PaymentStatus.DECLINED]: { label: 'Rechazado', tone: 'danger' },
  [PaymentStatus.REFUNDED]: { label: 'Reembolsado', tone: 'info' },
  [PaymentStatus.EXPIRED]: { label: 'Expirado', tone: 'neutral' },
};

export const releaseReasonLabel: Record<SeatReleaseReason, string> = {
  [SeatReleaseReason.EXPIRED]: 'el tiempo de bloqueo expiró',
  [SeatReleaseReason.USER_CANCELLED]: 'fue liberado por el usuario',
  [SeatReleaseReason.PAYMENT_REFUNDED]: 'el pago fue reembolsado',
  [SeatReleaseReason.FLIGHT_CANCELLED]: 'el vuelo fue cancelado',
};

export const roleLabel: Record<UserRole, string> = {
  [UserRole.CUSTOMER]: 'Cliente',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.SPECTATOR]: 'Espectador',
};
