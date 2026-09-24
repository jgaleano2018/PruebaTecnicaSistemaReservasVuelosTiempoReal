import { randomUUID } from 'crypto';
import { PaymentStatus } from '@reservas-vuelos/shared';
import { Payment, PaymentIntent, PaymentIntentRepository, PaymentRepository, Refund, RefundRepository } from '../../domain/payment';

export class InMemoryPaymentIntentRepository implements PaymentIntentRepository {
  readonly items = new Map<string, PaymentIntent>();
  nextId() {
    return `pi_${randomUUID()}`;
  }
  async create(i: PaymentIntent) {
    this.items.set(i.id, { ...i });
    return i;
  }
  async findById(id: string) {
    const i = this.items.get(id);
    return i ? { ...i } : null;
  }
  async findByReservation(reservationId: string) {
    return [...this.items.values()].find((i) => i.reservationId === reservationId) ?? null;
  }
  async transition(id: string, from: PaymentIntent['status'][], patch: Partial<PaymentIntent>) {
    const i = this.items.get(id);
    if (!i || !from.includes(i.status)) return null;
    Object.assign(i, patch, { id });
    return { ...i };
  }
}

export class InMemoryPaymentRepository implements PaymentRepository {
  readonly items = new Map<string, Payment>();
  nextId() {
    return `pay_${randomUUID()}`;
  }
  async create(p: Payment) {
    this.items.set(p.id, { ...p });
    return p;
  }
  async findById(id: string) {
    const p = this.items.get(id);
    return p ? { ...p } : null;
  }
  async findByUser(userId: string) {
    return [...this.items.values()].filter((p) => p.userId === userId);
  }
  async findApprovedByReservation(reservationId: string) {
    return [...this.items.values()].find((p) => p.reservationId === reservationId && p.status === PaymentStatus.APPROVED) ?? null;
  }
  async findApprovedByFlight(flightId: string) {
    return [...this.items.values()].filter((p) => p.flightId === flightId && p.status === PaymentStatus.APPROVED);
  }
  async transition(id: string, from: PaymentStatus[], patch: Partial<Payment>) {
    const p = this.items.get(id);
    if (!p || !from.includes(p.status)) return null;
    Object.assign(p, patch, { id });
    return { ...p };
  }
  async setReservationCode(reservationId: string, code: string) {
    for (const p of this.items.values()) if (p.reservationId === reservationId && p.status === PaymentStatus.APPROVED) p.reservationCode = code;
  }
}

export class InMemoryRefundRepository implements RefundRepository {
  readonly items: Refund[] = [];
  async create(r: Refund) {
    this.items.push(r);
    return r;
  }
  async findByPayment(paymentId: string) {
    return this.items.filter((r) => r.paymentId === paymentId);
  }
}
