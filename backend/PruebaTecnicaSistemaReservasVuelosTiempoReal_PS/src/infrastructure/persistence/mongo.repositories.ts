import { Schema, model, Types } from 'mongoose';
import { PaymentStatus } from '@reservas-vuelos/shared';
import { Payment, PaymentIntent, PaymentIntentRepository, PaymentRepository, Refund, RefundRepository } from '../../domain/payment';

/* ---------------- Colecciones de payment-db ---------------- */

const passengerSchema = new Schema(
  { firstName: String, lastName: String, documentType: String, documentNumber: String, email: String, phone: String, birthDate: String },
  { _id: false },
);

const intentSchema = new Schema(
  {
    _id: { type: String, required: true },
    reservationId: { type: String, required: true, unique: true },
    flightId: { type: String, required: true },
    seatNumber: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    status: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, required: true },
  },
  { collection: 'intenciones_pago', versionKey: false },
);

const paymentSchema = new Schema(
  {
    _id: { type: String, required: true },
    paymentIntentId: { type: String, required: true, index: true },
    reservationId: { type: String, required: true },
    reservationCode: String,
    flightId: { type: String, required: true, index: true },
    seatNumber: String,
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: String,
    status: { type: String, enum: Object.values(PaymentStatus), required: true },
    cardBrand: String,
    cardLast4: String,
    authorizationCode: String,
    declineReason: String,
    passenger: passengerSchema,
    createdAt: { type: Date, required: true },
  },
  { collection: 'pagos', versionKey: false },
);
// Un único pago aprobado por reserva
paymentSchema.index({ reservationId: 1 }, { unique: true, partialFilterExpression: { status: PaymentStatus.APPROVED } });

const refundSchema = new Schema(
  {
    _id: { type: String, required: true },
    paymentId: { type: String, required: true, index: true },
    reservationId: String,
    amount: Number,
    reason: String,
    requestedBy: String,
    createdAt: Date,
  },
  { collection: 'reembolsos', versionKey: false },
);

export const PaymentIntentModel = model('PaymentIntent', intentSchema);
export const PaymentModel = model('Payment', paymentSchema);
export const RefundModel = model('Refund', refundSchema);
export const PAYMENT_DB_COLLECTIONS = [PaymentIntentModel, PaymentModel, RefundModel];

const strip = <T>(d: any): T => {
  const { _id, ...rest } = d;
  return { id: _id, ...rest } as T;
};
const toIntent = (d: any) => strip<PaymentIntent>({ ...d, expiresAt: new Date(d.expiresAt), createdAt: new Date(d.createdAt) });
const toPayment = (d: any) => strip<Payment>({ ...d, createdAt: new Date(d.createdAt) });

export class MongoPaymentIntentRepository implements PaymentIntentRepository {
  nextId() {
    return `pi_${new Types.ObjectId().toHexString()}`;
  }
  async create(i: PaymentIntent) {
    const { id, ...rest } = i;
    await PaymentIntentModel.create({ _id: id, ...rest });
    return i;
  }
  async findById(id: string) {
    const d = await PaymentIntentModel.findById(id).lean();
    return d ? toIntent(d) : null;
  }
  async findByReservation(reservationId: string) {
    const d = await PaymentIntentModel.findOne({ reservationId }).lean();
    return d ? toIntent(d) : null;
  }
  async transition(id: string, from: PaymentIntent['status'][], patch: Partial<PaymentIntent>) {
    const { id: _i, ...set } = patch;
    const d = await PaymentIntentModel.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: set }, { new: true }).lean();
    return d ? toIntent(d) : null;
  }
}

export class MongoPaymentRepository implements PaymentRepository {
  nextId() {
    return `pay_${new Types.ObjectId().toHexString()}`;
  }
  async create(p: Payment) {
    const { id, ...rest } = p;
    await PaymentModel.create({ _id: id, ...rest });
    return p;
  }
  async findById(id: string) {
    const d = await PaymentModel.findById(id).lean();
    return d ? toPayment(d) : null;
  }
  async findByUser(userId: string) {
    return (await PaymentModel.find({ userId }).sort({ createdAt: -1 }).lean()).map(toPayment);
  }
  async findApprovedByReservation(reservationId: string) {
    const d = await PaymentModel.findOne({ reservationId, status: PaymentStatus.APPROVED }).lean();
    return d ? toPayment(d) : null;
  }
  async findApprovedByFlight(flightId: string) {
    return (await PaymentModel.find({ flightId, status: PaymentStatus.APPROVED }).lean()).map(toPayment);
  }
  async transition(id: string, from: PaymentStatus[], patch: Partial<Payment>) {
    const { id: _i, ...set } = patch;
    const d = await PaymentModel.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: set }, { new: true }).lean();
    return d ? toPayment(d) : null;
  }
  async setReservationCode(reservationId: string, code: string) {
    await PaymentModel.updateMany({ reservationId, status: PaymentStatus.APPROVED }, { $set: { reservationCode: code } });
  }
}

export class MongoRefundRepository implements RefundRepository {
  async create(r: Refund) {
    const { id, ...rest } = r;
    await RefundModel.create({ _id: id, ...rest });
    return r;
  }
  async findByPayment(paymentId: string) {
    return (await RefundModel.find({ paymentId }).lean()).map((d) => strip<Refund>({ ...d, createdAt: new Date(d.createdAt as any) }));
  }
}
