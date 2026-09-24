import { FlightStatus, PaymentStatus, SeatReleaseReason } from '../enums';
import { FlightOccupancyDto, PassengerDto } from '../dtos';

/**
 * Catálogo de eventos de dominio que viajan por el Event Bus (Kafka).
 * Los nombres coinciden con el diagrama de arquitectura:
 * SeatLocked, SeatReleased, ReservationConfirmed, FlightStatusChanged, PaymentProcessed.
 * Se agregan ReservationFailed, PaymentRefunded y FlightOccupancyUpdated para
 * compensaciones (saga) y para alimentar el dashboard en vivo.
 */
export const EventTypes = {
  SeatLocked: 'SeatLocked',
  SeatReleased: 'SeatReleased',
  ReservationConfirmed: 'ReservationConfirmed',
  ReservationFailed: 'ReservationFailed',
  FlightStatusChanged: 'FlightStatusChanged',
  PaymentProcessed: 'PaymentProcessed',
  PaymentRefunded: 'PaymentRefunded',
  FlightOccupancyUpdated: 'FlightOccupancyUpdated',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

/** Un tópico de Kafka por tipo de evento. La clave de partición es el flightId (orden por vuelo). */
export const KafkaTopics: Record<EventType, string> = {
  SeatLocked: 'reservas.seat.locked',
  SeatReleased: 'reservas.seat.released',
  ReservationConfirmed: 'reservas.reservation.confirmed',
  ReservationFailed: 'reservas.reservation.failed',
  FlightStatusChanged: 'reservas.flight.status-changed',
  PaymentProcessed: 'reservas.payment.processed',
  PaymentRefunded: 'reservas.payment.refunded',
  FlightOccupancyUpdated: 'reservas.flight.occupancy-updated',
};

export const ALL_TOPICS = Object.values(KafkaTopics);

export function eventTypeFromTopic(topic: string): EventType | undefined {
  return (Object.keys(KafkaTopics) as EventType[]).find((k) => KafkaTopics[k] === topic);
}

/* ------------------------------------------------------------------ */
/* Payloads                                                            */
/* ------------------------------------------------------------------ */

export interface SeatLockedPayload {
  flightId: string;
  seatNumber: string;
  reservationId: string;
  userId: string;
  price: number;
  currency: string;
  expiresAt: string;
}

export interface SeatReleasedPayload {
  flightId: string;
  seatNumber: string;
  reservationId: string;
  reason: SeatReleaseReason;
}

export interface ReservationConfirmedPayload {
  reservationId: string;
  reservationCode: string;
  flightId: string;
  flightNumber: string;
  seatNumber: string;
  userId: string;
  customerId: string;
  paymentId: string;
  price: number;
  currency: string;
  confirmedAt: string;
}

export interface ReservationFailedPayload {
  reservationId: string;
  paymentId: string;
  flightId: string;
  seatNumber: string;
  reason: string;
}

export interface FlightStatusChangedPayload {
  flightId: string;
  flightNumber: string;
  previousStatus: FlightStatus;
  newStatus: FlightStatus;
  delayMinutes?: number;
  reason?: string;
  changedBy: string;
}

export interface PaymentProcessedPayload {
  paymentId: string;
  paymentIntentId: string;
  reservationId: string;
  flightId: string;
  seatNumber: string;
  userId: string;
  status: PaymentStatus.APPROVED | PaymentStatus.DECLINED;
  amount: number;
  currency: string;
  passenger: PassengerDto;
  declineReason?: string;
}

export interface PaymentRefundedPayload {
  paymentId: string;
  refundId: string;
  reservationId: string;
  flightId: string;
  seatNumber: string;
  amount: number;
  reason: string;
}

export interface FlightOccupancyUpdatedPayload {
  occupancy: FlightOccupancyDto;
}

export interface EventPayloadMap {
  SeatLocked: SeatLockedPayload;
  SeatReleased: SeatReleasedPayload;
  ReservationConfirmed: ReservationConfirmedPayload;
  ReservationFailed: ReservationFailedPayload;
  FlightStatusChanged: FlightStatusChangedPayload;
  PaymentProcessed: PaymentProcessedPayload;
  PaymentRefunded: PaymentRefundedPayload;
  FlightOccupancyUpdated: FlightOccupancyUpdatedPayload;
}

/** Sobre (envelope) común para todos los eventos publicados en Kafka. */
export interface DomainEvent<T extends EventType = EventType> {
  eventId: string;
  type: T;
  version: 1;
  source: 'monolith' | 'flight-management-service' | 'payment-service' | 'realtime-gateway';
  occurredAt: string;
  /** Clave de partición / agregado (normalmente el flightId) */
  key: string;
  payload: EventPayloadMap[T];
}

export type AnyDomainEvent = { [K in EventType]: DomainEvent<K> }[EventType];
