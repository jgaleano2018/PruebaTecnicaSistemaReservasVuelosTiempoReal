import request from 'supertest';
import { EventTypes, ReservationStatus, SeatHoldDto, UserRole } from '@reservas-vuelos/shared';
import { compose } from '../src/container';
import { createHttpApp } from '../src/app';
import { InMemoryBroker, InMemoryEventBus } from '../src/shared/infrastructure/messaging/in-memory-event-bus';
import { InMemoryPaymentIntentRepository, InMemoryPaymentRepository, InMemoryRefundRepository } from '../src/infrastructure/persistence/in-memory.repositories';
import { FakePaymentGateway } from '../src/infrastructure/gateway/fake-payment.gateway';
import { ReservationHoldClient } from '../src/domain/payment';

process.env.LOG_LEVEL = 'silent';

function setup(expiresInMs = 7 * 60000) {
  let n = 0;
  const holds: ReservationHoldClient = {
    createHold: async (input) => {
      n++;
      const hold: SeatHoldDto = {
        holdId: `R${n}`, reservationId: `R${n}`, flightId: input.flightId, seatNumber: input.seatNumber, userId: 'U1',
        price: 350000, currency: 'COP', expiresAt: new Date(Date.now() + expiresInMs).toISOString(), status: ReservationStatus.PENDING_PAYMENT,
      };
      return hold;
    },
    releaseHold: async () => ({}) as any,
  };
  const broker = new InMemoryBroker();
  const bus = new InMemoryEventBus('payment-service', broker);
  const monolith = new InMemoryEventBus('monolith', broker);
  const c = compose(
    { intents: new InMemoryPaymentIntentRepository(), payments: new InMemoryPaymentRepository(), refunds: new InMemoryRefundRepository(), gateway: new FakePaymentGateway(20), holds },
    bus,
    { jwtSecret: 'test-secret-key-1234567890', jwtExpiresIn: '1h' },
  );
  const app = createHttpApp(c.router, { httpLogs: false, service: 'ps' });
  const u1 = c.jwt.sign({ sub: 'U1', email: 'u1@x.com', role: UserRole.CUSTOMER, name: 'U1' });
  const u2 = c.jwt.sign({ sub: 'U2', email: 'u2@x.com', role: UserRole.CUSTOMER, name: 'U2' });
  return { app, bus, monolith, broker, u1, u2 };
}

const passenger = { firstName: 'Laura', lastName: 'Gómez', documentType: 'CC', documentNumber: '1037600001', email: 'laura@example.com' };
const card = (number = '4111111111111111') => ({ number, holderName: 'LAURA GOMEZ', expiryMonth: 12, expiryYear: 2030, cvv: '123' });

describe('Payment Service', () => {
  it('HU2: POST /checkout/holds bloquea el asiento y crea la intención de pago', async () => {
    const { app, u1 } = setup();
    const res = await request(app).post('/api/v1/checkout/holds').set('Authorization', `Bearer ${u1}`).send({ flightId: 'F1', seatNumber: '12a' });
    expect(res.status).toBe(201);
    expect(res.body.data.hold.seatNumber).toBe('12A');
    expect(res.body.data.paymentIntent).toMatchObject({ status: 'PENDING', amount: 350000, reservationId: 'R1' });
  });

  it('valida datos de tarjeta (Luhn, vencimiento, CVV)', async () => {
    const { app, u1 } = setup();
    const intent = (await request(app).post('/api/v1/checkout/holds').set('Authorization', `Bearer ${u1}`).send({ flightId: 'F1', seatNumber: '1A' })).body.data.paymentIntent;
    const res = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${u1}`).send({
      paymentIntentId: intent.id, passenger, card: { number: '4111111111111112', holderName: 'X Y Z', expiryMonth: 1, expiryYear: 2020, cvv: '1' },
    });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(['card']));
  });

  it('HU3: aprueba el pago, publica PaymentProcessed y evita el doble cobro concurrente', async () => {
    const { app, u1, bus } = setup();
    const intent = (await request(app).post('/api/v1/checkout/holds').set('Authorization', `Bearer ${u1}`).send({ flightId: 'F1', seatNumber: '1A' })).body.data.paymentIntent;
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/payments').set('Authorization', `Bearer ${u1}`).send({ paymentIntentId: intent.id, passenger, card: card() }),
      request(app).post('/api/v1/payments').set('Authorization', `Bearer ${u1}`).send({ paymentIntentId: intent.id, passenger, card: card() }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const events = bus.published.filter((e) => e.type === EventTypes.PaymentProcessed);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ status: 'APPROVED', reservationId: 'R1' });
  });

  it('rechaza la tarjeta de prueba 4000000000000002 y permite reintentar', async () => {
    const { app, u1 } = setup();
    const intent = (await request(app).post('/api/v1/checkout/holds').set('Authorization', `Bearer ${u1}`).send({ flightId: 'F1', seatNumber: '1A' })).body.data.paymentIntent;
    const declined = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${u1}`).send({ paymentIntentId: intent.id, passenger, card: card('4000000000000002') });
    expect(declined.status).toBe(402);
    expect(declined.body.data.declineReason).toBe('Fondos insuficientes');
    const retry = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${u1}`).send({ paymentIntentId: intent.id, passenger, card: card() });
    expect(retry.status).toBe(201);
  });

  it('no permite pagar un bloqueo expirado ni la intención de otro usuario', async () => {
    const { app, u1, u2 } = setup(-1000);
    const intent = (await request(app).post('/api/v1/checkout/holds').set('Authorization', `Bearer ${u1}`).send({ flightId: 'F1', seatNumber: '1A' })).body.data.paymentIntent;
    const other = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${u2}`).send({ paymentIntentId: intent.id, passenger, card: card() });
    expect(other.status).toBe(403);
    const expired = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${u1}`).send({ paymentIntentId: intent.id, passenger, card: card() });
    expect(expired.body.error.code).toBe('HOLD_EXPIRED');
  });

  it('ReservationFailed dispara el reembolso automático (compensación)', async () => {
    const { app, u1, bus, monolith, broker } = setup();
    const intent = (await request(app).post('/api/v1/checkout/holds').set('Authorization', `Bearer ${u1}`).send({ flightId: 'F1', seatNumber: '1A' })).body.data.paymentIntent;
    const paid = (await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${u1}`).send({ paymentIntentId: intent.id, passenger, card: card() })).body.data;
    await monolith.publish(EventTypes.ReservationFailed, 'F1', { reservationId: 'R1', paymentId: paid.id, flightId: 'F1', seatNumber: '1A', reason: 'Asiento perdido' });
    await broker.drain();
    const p = await request(app).get(`/api/v1/payments/${paid.id}`).set('Authorization', `Bearer ${u1}`);
    expect(p.body.data.status).toBe('REFUNDED');
    expect(bus.published.map((e) => e.type)).toContain(EventTypes.PaymentRefunded);
  });
});
