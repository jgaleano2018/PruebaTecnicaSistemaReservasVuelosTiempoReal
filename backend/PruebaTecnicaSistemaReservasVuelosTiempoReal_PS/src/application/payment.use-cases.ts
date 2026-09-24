import { randomUUID } from 'crypto';
import {
  CheckoutHoldResponseDto,
  CreateSeatHoldInput,
  EventTypes,
  PaymentDto,
  PaymentStatus,
  ProcessPaymentInput,
  RefundDto,
  SeatReleaseReason,
  UserRole,
} from '@reservas-vuelos/shared';
import { Clock } from '../shared/application/clock.port';
import { EventBus } from '../shared/application/event-bus.port';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/domain/errors';
import { logger } from '../shared/infrastructure/logging/logger';
import {
  PaymentGateway,
  PaymentIntentRepository,
  PaymentRepository,
  RefundRepository,
  ReservationHoldClient,
  toIntentDto,
  toPaymentDto,
  toRefundDto,
} from '../domain/payment';

interface Requester {
  sub: string;
  role: UserRole;
}

/**
 * HU2 - Endpoint POST asociado al Payment Service:
 * bloquea temporalmente el asiento (vía módulo de Reservas del monolito, que emite SeatLocked)
 * y abre la intención de pago mientras el cliente completa sus datos.
 */
export class CreateCheckoutHoldUseCase {
  constructor(
    private readonly holds: ReservationHoldClient,
    private readonly intents: PaymentIntentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateSeatHoldInput, requester: Requester, bearerToken: string): Promise<CheckoutHoldResponseDto> {
    const hold = await this.holds.createHold(input, bearerToken);
    const existing = await this.intents.findByReservation(hold.reservationId);
    if (existing && existing.status === PaymentStatus.PENDING) return { hold, paymentIntent: toIntentDto(existing) };

    const intent = await this.intents.create({
      id: this.intents.nextId(),
      reservationId: hold.reservationId,
      flightId: hold.flightId,
      seatNumber: hold.seatNumber,
      userId: requester.sub,
      amount: hold.price,
      currency: hold.currency,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(hold.expiresAt),
      attempts: 0,
      createdAt: this.clock.now(),
    });
    return { hold, paymentIntent: toIntentDto(intent) };
  }
}

export class ReleaseCheckoutHoldUseCase {
  constructor(private readonly holds: ReservationHoldClient) {}
  execute(reservationId: string, bearerToken: string) {
    return this.holds.releaseHold(reservationId, bearerToken);
  }
}

/**
 * HU3 - Confirmación y procesamiento del pago con datos ficticios.
 * Publica PaymentProcessed; el monolito confirma la reserva y emite ReservationConfirmed.
 */
export class ProcessPaymentUseCase {
  constructor(
    private readonly intents: PaymentIntentRepository,
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(input: ProcessPaymentInput, requester: Requester): Promise<PaymentDto> {
    const intent = await this.intents.findById(input.paymentIntentId);
    if (!intent) throw new NotFoundError('Intención de pago', input.paymentIntentId);
    if (intent.userId !== requester.sub) throw new ForbiddenError('La intención de pago pertenece a otro usuario');
    if (intent.status === PaymentStatus.APPROVED) throw new ConflictError('ALREADY_PAID', 'Esta reserva ya fue pagada');
    if (intent.status !== PaymentStatus.PENDING) {
      throw new ConflictError('INTENT_NOT_PAYABLE', `La intención de pago está en estado ${intent.status}`);
    }
    const now = this.clock.now();
    if (intent.expiresAt.getTime() <= now.getTime()) {
      await this.intents.transition(intent.id, [PaymentStatus.PENDING], { status: PaymentStatus.EXPIRED });
      throw new ConflictError('HOLD_EXPIRED', 'El bloqueo del asiento expiró; seleccione el asiento nuevamente');
    }

    // Candado optimista: evita doble cobro si llegan dos solicitudes simultáneas.
    const locked = await this.intents.transition(intent.id, [PaymentStatus.PENDING], {
      status: 'PROCESSING',
      attempts: intent.attempts + 1,
    });
    if (!locked) throw new ConflictError('PAYMENT_IN_PROGRESS', 'Ya hay un pago en proceso para esta reserva');

    let result;
    try {
      result = await this.gateway.charge({ amount: intent.amount, currency: intent.currency, card: input.card, reference: intent.reservationId });
    } catch (err) {
      await this.intents.transition(intent.id, ['PROCESSING'], { status: PaymentStatus.PENDING });
      throw err;
    }

    const payment = await this.payments.create({
      id: this.payments.nextId(),
      paymentIntentId: intent.id,
      reservationId: intent.reservationId,
      flightId: intent.flightId,
      seatNumber: intent.seatNumber,
      userId: intent.userId,
      amount: intent.amount,
      currency: intent.currency,
      status: result.approved ? PaymentStatus.APPROVED : PaymentStatus.DECLINED,
      cardBrand: result.cardBrand,
      cardLast4: result.cardLast4,
      authorizationCode: result.authorizationCode,
      declineReason: result.declineReason,
      passenger: input.passenger,
      createdAt: this.clock.now(),
    });

    await this.intents.transition(intent.id, ['PROCESSING'], {
      status: result.approved ? PaymentStatus.APPROVED : PaymentStatus.PENDING,
    });

    await this.bus.publish(EventTypes.PaymentProcessed, intent.flightId, {
      paymentId: payment.id,
      paymentIntentId: intent.id,
      reservationId: intent.reservationId,
      flightId: intent.flightId,
      seatNumber: intent.seatNumber,
      userId: intent.userId,
      status: payment.status as PaymentStatus.APPROVED | PaymentStatus.DECLINED,
      amount: payment.amount,
      currency: payment.currency,
      passenger: input.passenger,
      declineReason: payment.declineReason,
    });

    return toPaymentDto(payment);
  }
}

/** Reembolsos (manuales o automáticos por compensación). */
export class RefundPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly refunds: RefundRepository,
    private readonly gateway: PaymentGateway,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(paymentId: string, reason: string, requester: Requester | 'system'): Promise<RefundDto> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new NotFoundError('Pago', paymentId);
    if (requester !== 'system' && requester.role !== UserRole.ADMIN && payment.userId !== requester.sub) {
      throw new ForbiddenError();
    }
    const updated = await this.payments.transition(paymentId, [PaymentStatus.APPROVED], { status: PaymentStatus.REFUNDED });
    if (!updated) throw new ConflictError('NOT_REFUNDABLE', `El pago está en estado ${payment.status}`);

    await this.gateway.refund({ authorizationCode: payment.authorizationCode ?? '', amount: payment.amount });
    const refund = await this.refunds.create({
      id: randomUUID(),
      paymentId,
      reservationId: payment.reservationId,
      amount: payment.amount,
      reason,
      requestedBy: requester === 'system' ? 'system' : requester.sub,
      createdAt: this.clock.now(),
    });

    await this.bus.publish(EventTypes.PaymentRefunded, payment.flightId, {
      paymentId,
      refundId: refund.id,
      reservationId: payment.reservationId,
      flightId: payment.flightId,
      seatNumber: payment.seatNumber,
      amount: payment.amount,
      reason,
    });
    return toRefundDto(refund);
  }
}

/** Reacciones a eventos de otros servicios (saga / compensaciones). */
export class PaymentEventHandlers {
  constructor(
    private readonly intents: PaymentIntentRepository,
    private readonly payments: PaymentRepository,
    private readonly refund: RefundPaymentUseCase,
  ) {}

  /** SeatReleased: el bloqueo terminó => la intención ya no se puede pagar. */
  async onSeatReleased(reservationId: string, reason: SeatReleaseReason): Promise<void> {
    const intent = await this.intents.findByReservation(reservationId);
    if (!intent) return;
    const status = reason === SeatReleaseReason.EXPIRED ? PaymentStatus.EXPIRED : 'CANCELLED';
    await this.intents.transition(intent.id, [PaymentStatus.PENDING], { status });
  }

  /** ReservationFailed: se cobró pero no se pudo asignar el asiento => reembolso automático. */
  async onReservationFailed(paymentId: string, reason: string): Promise<void> {
    await this.refund.execute(paymentId, `Reembolso automático: ${reason}`, 'system').catch((err) => {
      logger.warn({ paymentId, err: err.message }, 'No se aplicó reembolso automático');
    });
  }

  /** ReservationConfirmed: se asocia el código de reserva al pago. */
  async onReservationConfirmed(reservationId: string, code: string): Promise<void> {
    await this.payments.setReservationCode(reservationId, code);
  }

  /** FlightStatusChanged(CANCELLED): reembolso de todos los pagos aprobados del vuelo. */
  async onFlightCancelled(flightId: string): Promise<number> {
    const approved = await this.payments.findApprovedByFlight(flightId);
    let n = 0;
    for (const p of approved) {
      await this.refund.execute(p.id, 'Vuelo cancelado por la aerolínea', 'system').then(() => n++, () => undefined);
    }
    return n;
  }
}

export class PaymentQueries {
  constructor(
    private readonly intents: PaymentIntentRepository,
    private readonly payments: PaymentRepository,
    private readonly refunds: RefundRepository,
  ) {}

  private own<T extends { userId: string }>(x: T | null, what: string, id: string, r: Requester): T {
    if (!x) throw new NotFoundError(what, id);
    if (r.role !== UserRole.ADMIN && x.userId !== r.sub) throw new ForbiddenError();
    return x;
  }

  async intent(id: string, r: Requester) {
    return toIntentDto(this.own(await this.intents.findById(id), 'Intención de pago', id, r));
  }
  async payment(id: string, r: Requester) {
    const p = this.own(await this.payments.findById(id), 'Pago', id, r);
    return { ...toPaymentDto(p), refunds: (await this.refunds.findByPayment(id)).map(toRefundDto) };
  }
  async mine(userId: string) {
    return (await this.payments.findByUser(userId)).map(toPaymentDto);
  }
}
