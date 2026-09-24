import { CardDto, PassengerDto, PaymentDto, PaymentIntentDto, PaymentStatus, RefundDto, SeatHoldDto } from '@reservas-vuelos/shared';

/** Intención de pago asociada a un bloqueo temporal de asiento (colección `intenciones_pago`). */
export interface PaymentIntent {
  id: string;
  reservationId: string;
  flightId: string;
  seatNumber: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus | 'PROCESSING' | 'CANCELLED';
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

/** Pago procesado (colección `pagos`). Nunca se guarda el PAN completo ni el CVV. */
export interface Payment {
  id: string;
  paymentIntentId: string;
  reservationId: string;
  reservationCode?: string;
  flightId: string;
  seatNumber: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  cardBrand: string;
  cardLast4: string;
  authorizationCode?: string;
  declineReason?: string;
  passenger: PassengerDto;
  createdAt: Date;
}

/** Reembolso (colección `reembolsos`). */
export interface Refund {
  id: string;
  paymentId: string;
  reservationId: string;
  amount: number;
  reason: string;
  requestedBy: string;
  createdAt: Date;
}

export interface GatewayResult {
  approved: boolean;
  authorizationCode?: string;
  declineReason?: string;
  cardBrand: string;
  cardLast4: string;
}

/* ------------------------------ Puertos ------------------------------ */

export interface PaymentIntentRepository {
  nextId(): string;
  create(i: PaymentIntent): Promise<PaymentIntent>;
  findById(id: string): Promise<PaymentIntent | null>;
  findByReservation(reservationId: string): Promise<PaymentIntent | null>;
  transition(id: string, from: PaymentIntent['status'][], patch: Partial<PaymentIntent>): Promise<PaymentIntent | null>;
}

export interface PaymentRepository {
  nextId(): string;
  create(p: Payment): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByUser(userId: string): Promise<Payment[]>;
  findApprovedByReservation(reservationId: string): Promise<Payment | null>;
  findApprovedByFlight(flightId: string): Promise<Payment[]>;
  transition(id: string, from: PaymentStatus[], patch: Partial<Payment>): Promise<Payment | null>;
  setReservationCode(reservationId: string, code: string): Promise<void>;
}

export interface RefundRepository {
  create(r: Refund): Promise<Refund>;
  findByPayment(paymentId: string): Promise<Refund[]>;
}

/** Puerto hacia la pasarela de pagos externa. */
export interface PaymentGateway {
  charge(input: { amount: number; currency: string; card: CardDto; reference: string }): Promise<GatewayResult>;
  refund(input: { authorizationCode: string; amount: number }): Promise<{ ok: boolean }>;
}

/** Puerto hacia el módulo de Reservas del monolito (bloqueo temporal del asiento). */
export interface ReservationHoldClient {
  createHold(input: { flightId: string; seatNumber: string }, bearerToken: string): Promise<SeatHoldDto>;
  releaseHold(reservationId: string, bearerToken: string): Promise<SeatHoldDto>;
}

/* ------------------------------ Mappers ------------------------------ */

export const toIntentDto = (i: PaymentIntent): PaymentIntentDto => ({
  id: i.id,
  reservationId: i.reservationId,
  flightId: i.flightId,
  seatNumber: i.seatNumber,
  userId: i.userId,
  amount: i.amount,
  currency: i.currency,
  status: i.status as PaymentStatus,
  expiresAt: i.expiresAt.toISOString(),
  createdAt: i.createdAt.toISOString(),
});

export const toPaymentDto = (p: Payment): PaymentDto & { reservationCode?: string } => ({
  id: p.id,
  paymentIntentId: p.paymentIntentId,
  reservationId: p.reservationId,
  reservationCode: p.reservationCode,
  flightId: p.flightId,
  seatNumber: p.seatNumber,
  amount: p.amount,
  currency: p.currency,
  status: p.status,
  cardBrand: p.cardBrand,
  cardLast4: p.cardLast4,
  authorizationCode: p.authorizationCode,
  declineReason: p.declineReason,
  createdAt: p.createdAt.toISOString(),
});

export const toRefundDto = (r: Refund): RefundDto => ({
  id: r.id,
  paymentId: r.paymentId,
  amount: r.amount,
  reason: r.reason,
  createdAt: r.createdAt.toISOString(),
});
