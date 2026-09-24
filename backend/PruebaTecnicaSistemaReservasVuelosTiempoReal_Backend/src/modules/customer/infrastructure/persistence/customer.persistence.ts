import { randomUUID } from 'crypto';
import { Schema, model, Types } from 'mongoose';
import { PassengerDto } from '@reservas-vuelos/shared';
import { Customer, CustomerRepository } from '../../domain/customer';

/** Colección `clientes` */
const customerSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    documentType: { type: String, required: true },
    documentNumber: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String },
    birthDate: { type: String },
    reservationsCount: { type: Number, default: 0 },
  },
  { collection: 'clientes', timestamps: true, versionKey: false },
);
customerSchema.index({ documentType: 1, documentNumber: 1 }, { unique: true });
customerSchema.index({ email: 1 });

export const CustomerModel = model('Customer', customerSchema);

const toCustomer = (d: any): Customer => ({
  id: d._id,
  userId: d.userId ?? undefined,
  firstName: d.firstName,
  lastName: d.lastName,
  documentType: d.documentType,
  documentNumber: d.documentNumber,
  email: d.email,
  phone: d.phone ?? undefined,
  birthDate: d.birthDate ?? undefined,
  reservationsCount: d.reservationsCount ?? 0,
  createdAt: new Date(d.createdAt),
  updatedAt: new Date(d.updatedAt),
});

export class MongoCustomerRepository implements CustomerRepository {
  async upsertByDocument(p: PassengerDto, userId: string): Promise<Customer> {
    const d = await CustomerModel.findOneAndUpdate(
      { documentType: p.documentType, documentNumber: p.documentNumber },
      {
        $set: {
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          ...(p.phone ? { phone: p.phone } : {}),
          ...(p.birthDate ? { birthDate: p.birthDate } : {}),
        },
        $setOnInsert: { _id: new Types.ObjectId().toHexString(), userId, reservationsCount: 0 },
      },
      { upsert: true, new: true },
    ).lean();
    return toCustomer(d);
  }
  async findById(id: string) {
    const d = await CustomerModel.findById(id).lean();
    return d ? toCustomer(d) : null;
  }
  async findByUserId(userId: string) {
    return (await CustomerModel.find({ userId }).lean()).map(toCustomer);
  }
  async list(limit: number, skip: number) {
    return (await CustomerModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean()).map(toCustomer);
  }
  async incrementReservations(id: string) {
    await CustomerModel.updateOne({ _id: id }, { $inc: { reservationsCount: 1 } });
  }
  async updateContact(id: string, contact: { email?: string; phone?: string }) {
    const d = await CustomerModel.findByIdAndUpdate(id, { $set: contact }, { new: true }).lean();
    return d ? toCustomer(d) : null;
  }
}

export class InMemoryCustomerRepository implements CustomerRepository {
  readonly items = new Map<string, Customer>();
  async upsertByDocument(p: PassengerDto, userId: string) {
    let c = [...this.items.values()].find((x) => x.documentType === p.documentType && x.documentNumber === p.documentNumber);
    const now = new Date();
    if (!c) {
      c = { id: randomUUID(), userId, reservationsCount: 0, createdAt: now, updatedAt: now, ...p };
      this.items.set(c.id, c);
    } else Object.assign(c, { firstName: p.firstName, lastName: p.lastName, email: p.email, updatedAt: now });
    return { ...c };
  }
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByUserId(userId: string) {
    return [...this.items.values()].filter((c) => c.userId === userId);
  }
  async list(limit: number, skip: number) {
    return [...this.items.values()].slice(skip, skip + limit);
  }
  async incrementReservations(id: string) {
    const c = this.items.get(id);
    if (c) c.reservationsCount++;
  }
  async updateContact(id: string, contact: { email?: string; phone?: string }) {
    const c = this.items.get(id);
    if (!c) return null;
    Object.assign(c, contact);
    return c;
  }
}
