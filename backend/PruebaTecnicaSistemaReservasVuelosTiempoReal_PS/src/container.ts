import { Clock, systemClock } from './shared/application/clock.port';
import { EventBus } from './shared/application/event-bus.port';
import { JwtService } from './shared/infrastructure/auth/jwt';
import {
  CreateCheckoutHoldUseCase,
  PaymentEventHandlers,
  PaymentQueries,
  ProcessPaymentUseCase,
  RefundPaymentUseCase,
  ReleaseCheckoutHoldUseCase,
} from './application/payment.use-cases';
import { PaymentGateway, PaymentIntentRepository, PaymentRepository, RefundRepository, ReservationHoldClient } from './domain/payment';
import { registerConsumers } from './infrastructure/messaging/consumers';
import { buildRoutes } from './infrastructure/http/routes';

export interface Infrastructure {
  intents: PaymentIntentRepository;
  payments: PaymentRepository;
  refunds: RefundRepository;
  gateway: PaymentGateway;
  holds: ReservationHoldClient;
  clock?: Clock;
}

export function compose(infra: Infrastructure, bus: EventBus, cfg: { jwtSecret: string; jwtExpiresIn: string }) {
  const clock = infra.clock ?? systemClock;
  const jwt = new JwtService(cfg.jwtSecret, cfg.jwtExpiresIn);
  const refund = new RefundPaymentUseCase(infra.payments, infra.refunds, infra.gateway, bus, clock);
  const processPayment = new ProcessPaymentUseCase(infra.intents, infra.payments, infra.gateway, bus, clock);
  const createHold = new CreateCheckoutHoldUseCase(infra.holds, infra.intents, clock);
  registerConsumers(bus, new PaymentEventHandlers(infra.intents, infra.payments, refund));
  const router = buildRoutes({
    jwt,
    createHold,
    releaseHold: new ReleaseCheckoutHoldUseCase(infra.holds),
    processPayment,
    refund,
    queries: new PaymentQueries(infra.intents, infra.payments, infra.refunds),
  });
  return { router, jwt, processPayment, createHold, refund };
}
