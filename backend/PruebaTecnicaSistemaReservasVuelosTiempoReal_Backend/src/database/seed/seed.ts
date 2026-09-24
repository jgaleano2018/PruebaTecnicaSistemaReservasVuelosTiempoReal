import bcrypt from 'bcryptjs';
import mongoose, { Model, Types } from 'mongoose';
import { logger } from '@reservas-vuelos/service-kernel';
import { ensureCollections } from '@reservas-vuelos/service-kernel/database';
import { AircraftModel, AirportModel, FlightModel, RouteModel } from '../../modules/flight/infrastructure/persistence/flight.schemas';
import { ReservationModel, SeatModel } from '../../modules/reservation/infrastructure/persistence/reservation.schemas';
import { CustomerModel } from '../../modules/customer/infrastructure/persistence/customer.persistence';
import { UserModel } from '../../modules/auth/infrastructure/persistence/user.persistence';
import { buildSeedDataset, seedPassengers, seedUsers } from './seed-data';

/** Colecciones del monolito modular (ver diagrama: Base de Datos - MongoDB Monolito Modular). */
export const MONOLITH_COLLECTIONS: Array<[string, Model<any>]> = [
  ['vuelos', FlightModel],
  ['aeropuertos', AirportModel],
  ['rutas', RouteModel],
  ['aviones', AircraftModel],
  ['reservas', ReservationModel],
  ['clientes', CustomerModel],
  ['asientos', SeatModel],
  ['usuarios', UserModel],
];

async function insertInBatches(model: Model<any>, docs: any[], size = 5000): Promise<void> {
  for (let i = 0; i < docs.length; i += size) {
    await model.insertMany(docs.slice(i, i + size), { ordered: false, lean: true });
  }
}

export async function seedDatabase(opts: { onlyIfEmpty?: boolean; reset?: boolean; days?: number } = {}): Promise<void> {
  if (opts.onlyIfEmpty && !opts.reset && (await FlightModel.estimatedDocumentCount()) > 0) {
    logger.info('La base de datos ya tiene datos; se omite la carga inicial');
    return;
  }

  if (opts.reset) {
    for (const [, model] of MONOLITH_COLLECTIONS) await model.collection.drop().catch(() => undefined);
  }

  // 1. Crear colecciones e índices explícitamente
  await ensureCollections(MONOLITH_COLLECTIONS.map(([, model]) => model));
  logger.info({ collections: MONOLITH_COLLECTIONS.map(([name]) => name) }, 'Colecciones e índices listos');

  // 2. Datos
  const data = buildSeedDataset(new Date(), opts.days ?? 10);

  const users = await Promise.all(
    seedUsers.map(async (u) => ({
      _id: new Types.ObjectId().toHexString(),
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      passwordHash: await bcrypt.hash(u.password, 10),
    })),
  );
  await UserModel.insertMany(users);
  const historicalUserId = users.find((u) => u.email === 'cliente2@skyandes.com')!._id;

  const customers = seedPassengers.map((p) => ({
    _id: new Types.ObjectId().toHexString(),
    userId: historicalUserId,
    reservationsCount: 0,
    ...p,
  }));

  await AirportModel.insertMany(data.airports.map(({ code, ...a }) => ({ _id: code, ...a })));
  await RouteModel.insertMany(data.routes.map(({ id, ...r }) => ({ _id: id, ...r })));
  await AircraftModel.insertMany(data.aircraft.map(({ id, ...a }) => ({ _id: id, ...a })));
  await insertInBatches(FlightModel, data.flights.map(({ id, ...f }) => ({ _id: id, ...f })));
  await insertInBatches(SeatModel, data.seats);

  const reservations = data.reservations.map(({ id, ...r }, i) => {
    const customer = customers[data.reservationPassenger[i]];
    customer.reservationsCount++;
    const { _id: _c, userId: _u, reservationsCount: _n, ...passenger } = customer;
    return { _id: id, ...r, userId: historicalUserId, customerId: customer._id, passenger };
  });
  await CustomerModel.insertMany(customers);
  await insertInBatches(ReservationModel, reservations);

  logger.info(
    {
      db: mongoose.connection.name,
      aeropuertos: data.airports.length,
      rutas: data.routes.length,
      aviones: data.aircraft.length,
      vuelos: data.flights.length,
      asientos: data.seats.length,
      reservas: reservations.length,
      clientes: customers.length,
      usuarios: users.length,
    },
    'Carga inicial completada',
  );
}
