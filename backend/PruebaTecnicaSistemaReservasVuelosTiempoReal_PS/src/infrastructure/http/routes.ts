import { Router } from 'express';
import {
  createSeatHoldSchema,
  CreateSeatHoldInput,
  PaymentStatus,
  processPaymentSchema,
  ProcessPaymentInput,
  refundSchema,
  UserRole,
} from '@reservas-vuelos/shared';
import { asyncHandler, ok, validate, validated } from '../../shared/infrastructure/http/http-utils';
import { authenticate, authorize, JwtService } from '../../shared/infrastructure/auth/jwt';
import {
  CreateCheckoutHoldUseCase,
  PaymentQueries,
  ProcessPaymentUseCase,
  RefundPaymentUseCase,
  ReleaseCheckoutHoldUseCase,
} from '../../application/payment.use-cases';

export interface RoutesDeps {
  jwt: JwtService;
  createHold: CreateCheckoutHoldUseCase;
  releaseHold: ReleaseCheckoutHoldUseCase;
  processPayment: ProcessPaymentUseCase;
  refund: RefundPaymentUseCase;
  queries: PaymentQueries;
}

const bearer = (auth?: string) => (auth ?? '').replace(/^Bearer /, '');

export function buildRoutes(d: RoutesDeps): Router {
  const r = Router();
  r.use(authenticate(d.jwt));
  const buyer = authorize(UserRole.CUSTOMER, UserRole.ADMIN);

  /**
   * HU2 - POST: reservar temporalmente el asiento mientras se completan los datos de pago.
   * Respuesta: bloqueo (5-10 min) + intención de pago. El evento SeatLocked lo emite el módulo de Reservas.
   */
  r.post(
    '/checkout/holds',
    buyer,
    validate(createSeatHoldSchema),
    asyncHandler(async (req, res) => {
      const body = validated<typeof createSeatHoldSchema>(req) as CreateSeatHoldInput;
      ok(res, await d.createHold.execute(body, req.user!, bearer(req.headers.authorization)), 201);
    }),
  );

  r.delete(
    '/checkout/holds/:reservationId',
    buyer,
    asyncHandler(async (req, res) => ok(res, await d.releaseHold.execute(req.params.reservationId, bearer(req.headers.authorization)))),
  );

  r.get('/payment-intents/:intentId', asyncHandler(async (req, res) => ok(res, await d.queries.intent(req.params.intentId, req.user!))));

  /** HU3 - procesa el pago con datos ficticios (201 aprobado / 402 rechazado). */
  r.post(
    '/payments',
    buyer,
    validate(processPaymentSchema),
    asyncHandler(async (req, res) => {
      const body = validated<typeof processPaymentSchema>(req) as ProcessPaymentInput;
      const payment = await d.processPayment.execute(body, req.user!);
      ok(res, payment, payment.status === PaymentStatus.APPROVED ? 201 : 402, {
        next:
          payment.status === PaymentStatus.APPROVED
            ? 'La reserva se confirma de forma asíncrona: escuche reservation:confirmed (Realtime Gateway) o consulte GET /api/v1/reservations/:id/ticket en el monolito'
            : 'Pago rechazado: el asiento sigue bloqueado hasta su expiración, puede reintentar con otra tarjeta',
      });
    }),
  );

  r.get('/payments/me', asyncHandler(async (req, res) => ok(res, await d.queries.mine(req.user!.sub))));
  r.get('/payments/:paymentId', asyncHandler(async (req, res) => ok(res, await d.queries.payment(req.params.paymentId, req.user!))));

  /** Reembolsos */
  r.post(
    '/payments/:paymentId/refunds',
    validate(refundSchema),
    asyncHandler(async (req, res) => {
      const body = validated<typeof refundSchema>(req) as { reason: string };
      ok(res, await d.refund.execute(req.params.paymentId, body.reason, req.user!), 201);
    }),
  );

  return r;
}
