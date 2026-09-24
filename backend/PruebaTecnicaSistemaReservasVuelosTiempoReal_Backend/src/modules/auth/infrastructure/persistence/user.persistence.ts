import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { Schema, model, Types } from 'mongoose';
import { UserRole } from '@reservas-vuelos/shared';
import { PasswordHasher, User, UserRepository } from '../../domain/user';

/** Colección `usuarios` */
const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true },
    role: { type: String, enum: Object.values(UserRole), required: true },
  },
  { collection: 'usuarios', timestamps: true, versionKey: false },
);
export const UserModel = model('User', userSchema);

const toUser = (d: any): User => ({ id: d._id, email: d.email, passwordHash: d.passwordHash, fullName: d.fullName, role: d.role });

export class MongoUserRepository implements UserRepository {
  async findByEmail(email: string) {
    const d = await UserModel.findOne({ email: email.toLowerCase() }).lean();
    return d ? toUser(d) : null;
  }
  async findById(id: string) {
    const d = await UserModel.findById(id).lean();
    return d ? toUser(d) : null;
  }
  async create(u: Omit<User, 'id'>) {
    const d = await UserModel.create({ _id: new Types.ObjectId().toHexString(), ...u });
    return toUser(d.toObject());
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly items = new Map<string, User>();
  async findByEmail(email: string) {
    return [...this.items.values()].find((u) => u.email === email.toLowerCase()) ?? null;
  }
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async create(u: Omit<User, 'id'>) {
    const user = { ...u, id: randomUUID() };
    this.items.set(user.id, user);
    return user;
  }
}

export class BcryptPasswordHasher implements PasswordHasher {
  hash(plain: string) {
    return bcrypt.hash(plain, 10);
  }
  compare(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }
}
