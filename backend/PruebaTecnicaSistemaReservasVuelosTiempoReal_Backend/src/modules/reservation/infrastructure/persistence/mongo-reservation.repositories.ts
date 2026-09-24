import { Types } from 'mongoose';
import { ReservationStatus, SeatAvailabilityDto, SeatStatus } from '@reservas-vuelos/shared';
import { Reservation, Seat } from '../../domain/reservation.entities';
import { LockSeatCommand, ReservationRepository, SeatRepository } from '../../domain/reservation.ports';
import { ReservationModel, SeatModel } from './reservation.schemas';

function toSeat(d: any): Seat {
  return {
    flightId: d.flightId,
    seatNumber: d.seatNumber,
    row: d.row,
    column: d.column,
    cabinClass: d.cabinClass,
    position: d.position,
    price: d.price,
    currency: d.currency,
    status: d.status,
    lockedByReservationId: d.lockedByReservationId,
    lockedByUserId: d.lockedByUserId,
    lockExpiresAt: d.lockExpiresAt ? new Date(d.lockExpiresAt) : null,
    occupiedByReservationId: d.occupiedByReservationId,
  };
}

const CLEAR_LOCK = { lockedByReservationId: null, lockedByUserId: null, lockExpiresAt: null };

/**
 * Adaptador MongoDB de asientos. Cada cambio de estado es un único `findOneAndUpdate`
 * con precondición (compare-and-set), por lo que dos usuarios nunca pueden obtener el mismo asiento.
 */
export class MongoSeatRepository implements SeatRepository {
  async findByFlight(flightId: string): Promise<Seat[]> {
    return (await SeatModel.find({ flightId }).lean()).map(toSeat);
  }

  async findOne(flightId: string, seatNumber: string): Promise<Seat | null> {
    const d = await SeatModel.findOne({ flightId, seatNumber }).lean();
    return d ? toSeat(d) : null;
  }

  async tryLock(c: LockSeatCommand): Promise<Seat | null> {
    const d = await SeatModel.findOneAndUpdate(
      {
        flightId: c.flightId,
        seatNumber: c.seatNumber,
        $or: [{ status: SeatStatus.AVAILABLE }, { status: SeatStatus.LOCKED, lockExpiresAt: { $lte: c.now } }],
      },
      {
        $set: {
          status: SeatStatus.LOCKED,
          lockedByReservationId: c.reservationId,
          lockedByUserId: c.userId,
          lockExpiresAt: c.expiresAt,
        },
      },
      { new: true },
    ).lean();
    return d ? toSeat(d) : null;
  }

  async releaseLock(flightId: string, seatNumber: string, reservationId: string): Promise<boolean> {
    const res = await SeatModel.updateOne(
      { flightId, seatNumber, status: SeatStatus.LOCKED, lockedByReservationId: reservationId },
      { $set: { status: SeatStatus.AVAILABLE, ...CLEAR_LOCK } },
    );
    return res.modifiedCount === 1;
  }

  async releaseExpiredLock(flightId: string, seatNumber: string, reservationId: string, now: Date): Promise<boolean> {
    const res = await SeatModel.updateOne(
      {
        flightId,
        seatNumber,
        status: SeatStatus.LOCKED,
        lockedByReservationId: reservationId,
        lockExpiresAt: { $lte: now },
      },
      { $set: { status: SeatStatus.AVAILABLE, ...CLEAR_LOCK } },
    );
    return res.modifiedCount === 1;
  }

  async occupy(flightId: string, seatNumber: string, reservationId: string, now: Date): Promise<Seat | null> {
    const d = await SeatModel.findOneAndUpdate(
      {
        flightId,
        seatNumber,
        $or: [
          { status: SeatStatus.LOCKED, lockedByReservationId: reservationId },
          { status: SeatStatus.AVAILABLE },
          { status: SeatStatus.LOCKED, lockExpiresAt: { $lte: now } },
        ],
      },
      { $set: { status: SeatStatus.OCCUPIED, occupiedByReservationId: reservationId, ...CLEAR_LOCK } },
      { new: true },
    ).lean();
    return d ? toSeat(d) : null;
  }

  async releaseOccupied(flightId: string, seatNumber: string, reservationId: string): Promise<boolean> {
    const res = await SeatModel.updateOne(
      { flightId, seatNumber, status: SeatStatus.OCCUPIED, occupiedByReservationId: reservationId },
      { $set: { status: SeatStatus.AVAILABLE, occupiedByReservationId: null } },
    );
    return res.modifiedCount === 1;
  }

  async findExpiredLocks(now: Date, limit: number): Promise<Seat[]> {
    return (await SeatModel.find({ status: SeatStatus.LOCKED, lockExpiresAt: { $lte: now } }).limit(limit).lean()).map(toSeat);
  }

  async countByFlights(flightIds: string[], now: Date): Promise<Map<string, SeatAvailabilityDto>> {
    const rows = await SeatModel.aggregate<{ _id: { flightId: string; status: SeatStatus }; count: number }>([
      { $match: { flightId: { $in: flightIds } } },
      {
        $project: {
          flightId: 1,
          effectiveStatus: {
            $cond: [
              { $and: [{ $eq: ['$status', SeatStatus.LOCKED] }, { $lte: ['$lockExpiresAt', now] }] },
              SeatStatus.AVAILABLE,
              '$status',
            ],
          },
        },
      },
      { $group: { _id: { flightId: '$flightId', status: '$effectiveStatus' }, count: { $sum: 1 } } },
    ]);
    const map = new Map<string, SeatAvailabilityDto>();
    for (const id of flightIds) map.set(id, { total: 0, available: 0, locked: 0, occupied: 0 });
    for (const row of rows) {
      const s = map.get(row._id.flightId)!;
      s.total += row.count;
      if (row._id.status === SeatStatus.AVAILABLE) s.available += row.count;
      else if (row._id.status === SeatStatus.LOCKED) s.locked += row.count;
      else s.occupied += row.count;
    }
    return map;
  }
}

function toReservation(d: any): Reservation {
  return {
    id: d._id,
    reservationCode: d.reservationCode ?? undefined,
    flightId: d.flightId,
    flightNumber: d.flightNumber,
    seatNumber: d.seatNumber,
    cabinClass: d.cabinClass,
    userId: d.userId,
    customerId: d.customerId ?? undefined,
    passenger: d.passenger ?? undefined,
    status: d.status,
    price: d.price,
    currency: d.currency,
    holdExpiresAt: new Date(d.holdExpiresAt),
    paymentId: d.paymentId ?? undefined,
    failureReason: d.failureReason ?? undefined,
    createdAt: new Date(d.createdAt),
    confirmedAt: d.confirmedAt ? new Date(d.confirmedAt) : undefined,
    cancelledAt: d.cancelledAt ? new Date(d.cancelledAt) : undefined,
  };
}

export class MongoReservationRepository implements ReservationRepository {
  nextId(): string {
    return new Types.ObjectId().toHexString();
  }

  async create(r: Reservation): Promise<Reservation> {
    const { id, ...rest } = r;
    const doc = await ReservationModel.create({ _id: id, ...rest });
    return toReservation(doc.toObject());
  }

  async findById(id: string) {
    const d = await ReservationModel.findById(id).lean();
    return d ? toReservation(d) : null;
  }

  async findByCode(code: string) {
    const d = await ReservationModel.findOne({ reservationCode: code }).lean();
    return d ? toReservation(d) : null;
  }

  async findByUser(userId: string) {
    return (await ReservationModel.find({ userId }).sort({ createdAt: -1 }).lean()).map(toReservation);
  }

  async findByCustomer(customerId: string) {
    return (await ReservationModel.find({ customerId }).sort({ createdAt: -1 }).lean()).map(toReservation);
  }

  async findActiveHold(userId: string, flightId: string, seatNumber: string, now: Date) {
    const d = await ReservationModel.findOne({
      userId,
      flightId,
      seatNumber,
      status: ReservationStatus.PENDING_PAYMENT,
      holdExpiresAt: { $gt: now },
    }).lean();
    return d ? toReservation(d) : null;
  }

  countActiveHolds(userId: string, flightId: string, now: Date) {
    return ReservationModel.countDocuments({
      userId,
      flightId,
      status: ReservationStatus.PENDING_PAYMENT,
      holdExpiresAt: { $gt: now },
    });
  }

  async findPendingByFlight(flightId: string) {
    return (await ReservationModel.find({ flightId, status: ReservationStatus.PENDING_PAYMENT }).lean()).map(toReservation);
  }

  async expireStalePending(now: Date): Promise<number> {
    const res = await ReservationModel.updateMany(
      { status: ReservationStatus.PENDING_PAYMENT, holdExpiresAt: { $lte: now } },
      { $set: { status: ReservationStatus.EXPIRED } },
    );
    return res.modifiedCount;
  }

  async transition(id: string, from: ReservationStatus[], patch: Partial<Reservation>) {
    const { id: _ignored, ...set } = patch;
    const d = await ReservationModel.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: set }, { new: true }).lean();
    return d ? toReservation(d) : null;
  }
}
