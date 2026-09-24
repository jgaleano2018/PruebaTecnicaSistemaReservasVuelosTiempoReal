import { Schema, model } from 'mongoose';
import { FlightStatus, SeatStatus } from '@reservas-vuelos/shared';
import { ManagedFlight, StatusChange } from '../../domain/managed-flight';
import { FlightOccupancy } from '../../domain/occupancy';
import { ManagedFlightRepository, OccupancyRepository, StatusHistoryRepository, SyncLogRepository } from '../../domain/ports';

/* ---------------- Colecciones de flight-db ---------------- */

const managedFlightSchema = new Schema(
  {
    _id: { type: String, required: true },
    flightNumber: { type: String, required: true },
    airline: String,
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    departureTime: { type: Date, required: true, index: true },
    arrivalTime: Date,
    aircraft: String,
    status: { type: String, enum: Object.values(FlightStatus), required: true, index: true },
    delayMinutes: Number,
    lastSyncedAt: Date,
  },
  { collection: 'vuelos_gestion', timestamps: { createdAt: true, updatedAt: 'updatedAt' }, versionKey: false },
);

const statusHistorySchema = new Schema(
  {
    flightId: { type: String, required: true, index: true },
    previousStatus: String,
    newStatus: String,
    delayMinutes: Number,
    reason: String,
    changedBy: String,
    changedAt: { type: Date, required: true },
  },
  { collection: 'historial_estados', versionKey: false },
);

const occupancySchema = new Schema(
  {
    _id: { type: String, required: true },
    flightNumber: String,
    origin: String,
    destination: String,
    departureTime: { type: Date, index: true },
    status: String,
    seats: { type: Schema.Types.Mixed, default: {} },
    total: Number,
    available: Number,
    locked: Number,
    occupied: Number,
    updatedAt: Date,
  },
  { collection: 'ocupacion_vuelos', versionKey: false, minimize: false },
);

const syncLogSchema = new Schema(
  { type: String, flights: Number, changes: Number, details: Schema.Types.Mixed, at: Date },
  { collection: 'sincronizaciones', versionKey: false },
);

export const ManagedFlightModel = model('ManagedFlight', managedFlightSchema);
export const StatusHistoryModel = model('StatusHistory', statusHistorySchema);
export const OccupancyModel = model('FlightOccupancy', occupancySchema);
export const SyncLogModel = model('SyncLog', syncLogSchema);

export const FLIGHT_DB_COLLECTIONS = [ManagedFlightModel, StatusHistoryModel, OccupancyModel, SyncLogModel];

/* ---------------- Adaptadores ---------------- */

const toFlight = (d: any): ManagedFlight => ({
  id: d._id,
  flightNumber: d.flightNumber,
  airline: d.airline,
  origin: d.origin,
  destination: d.destination,
  departureTime: new Date(d.departureTime),
  arrivalTime: new Date(d.arrivalTime),
  aircraft: d.aircraft,
  status: d.status,
  delayMinutes: d.delayMinutes ?? undefined,
  lastSyncedAt: new Date(d.lastSyncedAt),
  updatedAt: new Date(d.updatedAt),
});

export class MongoManagedFlightRepository implements ManagedFlightRepository {
  async upsertMany(flights: Omit<ManagedFlight, 'updatedAt'>[]): Promise<number> {
    if (!flights.length) return 0;
    const res = await ManagedFlightModel.bulkWrite<any>(
      flights.map(({ id, status, delayMinutes, ...rest }) => ({
        updateOne: {
          filter: { _id: id },
          // El estado solo se toma del catálogo al crear; luego lo gobierna este servicio.
          update: { $set: rest, $setOnInsert: { status, ...(delayMinutes ? { delayMinutes } : {}) } },
          upsert: true,
        },
      })),
    );
    return res.upsertedCount + res.matchedCount;
  }
  async findById(id: string) {
    const d = await ManagedFlightModel.findById(id).lean();
    return d ? toFlight(d) : null;
  }
  async list(f: { from?: Date; to?: Date; status?: FlightStatus; origin?: string; destination?: string }) {
    const q: any = {};
    if (f.from || f.to) q.departureTime = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) };
    if (f.status) q.status = f.status;
    if (f.origin) q.origin = f.origin;
    if (f.destination) q.destination = f.destination;
    return (await ManagedFlightModel.find(q).sort({ departureTime: 1 }).limit(500).lean()).map(toFlight);
  }
  async updateStatus(id: string, expected: FlightStatus, status: FlightStatus, delayMinutes?: number) {
    const update: any = { $set: { status } };
    if (delayMinutes !== undefined) update.$set.delayMinutes = delayMinutes;
    else update.$unset = { delayMinutes: 1 };
    const d = await ManagedFlightModel.findOneAndUpdate({ _id: id, status: expected }, update, { new: true }).lean();
    return d ? toFlight(d) : null;
  }
}

export class MongoStatusHistoryRepository implements StatusHistoryRepository {
  async add(c: StatusChange) {
    await StatusHistoryModel.create(c);
  }
  async findByFlight(flightId: string) {
    return (await StatusHistoryModel.find({ flightId }).sort({ changedAt: -1 }).lean()).map((d: any) => ({
      flightId: d.flightId,
      previousStatus: d.previousStatus,
      newStatus: d.newStatus,
      delayMinutes: d.delayMinutes ?? undefined,
      reason: d.reason ?? undefined,
      changedBy: d.changedBy,
      changedAt: new Date(d.changedAt),
    }));
  }
}

export class MongoSyncLogRepository implements SyncLogRepository {
  async add(entry: { type: string; flights: number; changes: number; details?: unknown; at: Date }) {
    await SyncLogModel.create(entry);
  }
  async last(limit: number) {
    return SyncLogModel.find().sort({ at: -1 }).limit(limit).lean();
  }
}

const toOccupancy = (d: any): FlightOccupancy => ({
  flightId: d._id,
  flightNumber: d.flightNumber,
  origin: d.origin,
  destination: d.destination,
  departureTime: new Date(d.departureTime),
  status: d.status,
  seats: d.seats ?? {},
  total: d.total,
  available: d.available,
  locked: d.locked,
  occupied: d.occupied,
  updatedAt: new Date(d.updatedAt),
});

const countOf = (status: SeatStatus) => ({
  $size: { $filter: { input: { $objectToArray: '$seats' }, cond: { $eq: ['$$this.v', status] } } },
});

export class MongoOccupancyRepository implements OccupancyRepository {
  async findById(flightId: string) {
    const d = await OccupancyModel.findById(flightId).lean();
    return d ? toOccupancy(d) : null;
  }
  async save(o: FlightOccupancy) {
    const { flightId, ...rest } = o;
    await OccupancyModel.updateOne({ _id: flightId }, { $set: rest }, { upsert: true });
  }
  /** Update con pipeline: fija el asiento y recalcula contadores en una sola operación atómica. */
  async applySeatState(flightId: string, seatNumber: string, status: SeatStatus, at: Date) {
    const d = await OccupancyModel.findOneAndUpdate(
      { _id: flightId },
      [
        { $set: { seats: { $mergeObjects: ['$seats', { $arrayToObject: [[{ k: seatNumber, v: status }]] }] }, updatedAt: at } },
        {
          $set: {
            total: { $size: { $objectToArray: '$seats' } },
            available: countOf(SeatStatus.AVAILABLE),
            locked: countOf(SeatStatus.LOCKED),
            occupied: countOf(SeatStatus.OCCUPIED),
          },
        },
      ],
      { new: true },
    ).lean();
    return d ? toOccupancy(d) : null;
  }
  async setFlightStatus(flightId: string, status: FlightStatus) {
    await OccupancyModel.updateOne({ _id: flightId }, { $set: { status } });
  }
  async list(f: { from?: Date; to?: Date }) {
    const q: any = {};
    if (f.from || f.to) q.departureTime = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) };
    return (await OccupancyModel.find(q).sort({ departureTime: 1 }).limit(500).lean()).map(toOccupancy);
  }
}
