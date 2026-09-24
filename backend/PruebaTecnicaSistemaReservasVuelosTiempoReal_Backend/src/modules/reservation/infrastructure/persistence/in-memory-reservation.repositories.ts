import { randomUUID } from 'crypto';
import { ReservationStatus, SeatAvailabilityDto, SeatStatus } from '@reservas-vuelos/shared';
import { effectiveSeatStatus, Reservation, Seat } from '../../domain/reservation.entities';
import { LockSeatCommand, ReservationRepository, SeatRepository } from '../../domain/reservation.ports';

/** Adaptador en memoria: las operaciones son síncronas dentro del event loop, por lo tanto atómicas. */
export class InMemorySeatRepository implements SeatRepository {
  private readonly seats = new Map<string, Seat>();
  private key = (f: string, s: string) => `${f}#${s}`;

  add(...seats: Seat[]) {
    seats.forEach((s) => this.seats.set(this.key(s.flightId, s.seatNumber), { ...s }));
  }

  async findByFlight(flightId: string) {
    return [...this.seats.values()].filter((s) => s.flightId === flightId).map((s) => ({ ...s }));
  }

  async findOne(flightId: string, seatNumber: string) {
    const s = this.seats.get(this.key(flightId, seatNumber));
    return s ? { ...s } : null;
  }

  async tryLock(c: LockSeatCommand) {
    const s = this.seats.get(this.key(c.flightId, c.seatNumber));
    if (!s || effectiveSeatStatus(s, c.now) !== SeatStatus.AVAILABLE) return null;
    Object.assign(s, {
      status: SeatStatus.LOCKED,
      lockedByReservationId: c.reservationId,
      lockedByUserId: c.userId,
      lockExpiresAt: c.expiresAt,
    });
    return { ...s };
  }

  private clear(s: Seat) {
    s.lockedByReservationId = null;
    s.lockedByUserId = null;
    s.lockExpiresAt = null;
  }

  async releaseLock(flightId: string, seatNumber: string, reservationId: string) {
    const s = this.seats.get(this.key(flightId, seatNumber));
    if (!s || s.status !== SeatStatus.LOCKED || s.lockedByReservationId !== reservationId) return false;
    s.status = SeatStatus.AVAILABLE;
    this.clear(s);
    return true;
  }

  async releaseExpiredLock(flightId: string, seatNumber: string, reservationId: string, now: Date) {
    const s = this.seats.get(this.key(flightId, seatNumber));
    if (!s || s.status !== SeatStatus.LOCKED || s.lockedByReservationId !== reservationId) return false;
    if (!s.lockExpiresAt || s.lockExpiresAt > now) return false;
    s.status = SeatStatus.AVAILABLE;
    this.clear(s);
    return true;
  }

  async occupy(flightId: string, seatNumber: string, reservationId: string, now: Date) {
    const s = this.seats.get(this.key(flightId, seatNumber));
    if (!s) return null;
    const mine = s.status === SeatStatus.LOCKED && s.lockedByReservationId === reservationId;
    if (!mine && effectiveSeatStatus(s, now) !== SeatStatus.AVAILABLE) return null;
    s.status = SeatStatus.OCCUPIED;
    s.occupiedByReservationId = reservationId;
    this.clear(s);
    return { ...s };
  }

  async releaseOccupied(flightId: string, seatNumber: string, reservationId: string) {
    const s = this.seats.get(this.key(flightId, seatNumber));
    if (!s || s.status !== SeatStatus.OCCUPIED || s.occupiedByReservationId !== reservationId) return false;
    s.status = SeatStatus.AVAILABLE;
    s.occupiedByReservationId = null;
    return true;
  }

  async findExpiredLocks(now: Date, limit: number) {
    return [...this.seats.values()]
      .filter((s) => s.status === SeatStatus.LOCKED && s.lockExpiresAt && s.lockExpiresAt <= now)
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async countByFlights(flightIds: string[], now: Date) {
    const map = new Map<string, SeatAvailabilityDto>();
    for (const id of flightIds) map.set(id, { total: 0, available: 0, locked: 0, occupied: 0 });
    for (const s of this.seats.values()) {
      const m = map.get(s.flightId);
      if (!m) continue;
      m.total++;
      const st = effectiveSeatStatus(s, now);
      if (st === SeatStatus.AVAILABLE) m.available++;
      else if (st === SeatStatus.LOCKED) m.locked++;
      else m.occupied++;
    }
    return map;
  }
}

export class InMemoryReservationRepository implements ReservationRepository {
  readonly items = new Map<string, Reservation>();

  nextId() {
    return randomUUID().replace(/-/g, '').slice(0, 24);
  }
  async create(r: Reservation) {
    this.items.set(r.id, { ...r });
    return { ...r };
  }
  async findById(id: string) {
    const r = this.items.get(id);
    return r ? { ...r } : null;
  }
  async findByCode(code: string) {
    return [...this.items.values()].find((r) => r.reservationCode === code) ?? null;
  }
  async findByUser(userId: string) {
    return [...this.items.values()].filter((r) => r.userId === userId);
  }
  async findByCustomer(customerId: string) {
    return [...this.items.values()].filter((r) => r.customerId === customerId);
  }
  async findActiveHold(userId: string, flightId: string, seatNumber: string, now: Date) {
    return (
      [...this.items.values()].find(
        (r) =>
          r.userId === userId &&
          r.flightId === flightId &&
          r.seatNumber === seatNumber &&
          r.status === ReservationStatus.PENDING_PAYMENT &&
          r.holdExpiresAt > now,
      ) ?? null
    );
  }
  async countActiveHolds(userId: string, flightId: string, now: Date) {
    return [...this.items.values()].filter(
      (r) => r.userId === userId && r.flightId === flightId && r.status === ReservationStatus.PENDING_PAYMENT && r.holdExpiresAt > now,
    ).length;
  }
  async findPendingByFlight(flightId: string) {
    return [...this.items.values()].filter((r) => r.flightId === flightId && r.status === ReservationStatus.PENDING_PAYMENT);
  }
  async expireStalePending(now: Date) {
    let n = 0;
    for (const r of this.items.values()) {
      if (r.status === ReservationStatus.PENDING_PAYMENT && r.holdExpiresAt <= now) {
        r.status = ReservationStatus.EXPIRED;
        n++;
      }
    }
    return n;
  }
  async transition(id: string, from: ReservationStatus[], patch: Partial<Reservation>) {
    const r = this.items.get(id);
    if (!r || !from.includes(r.status)) return null;
    if (patch.reservationCode && [...this.items.values()].some((x) => x.reservationCode === patch.reservationCode)) {
      throw Object.assign(new Error('duplicate code'), { code: 11000 });
    }
    Object.assign(r, patch, { id });
    return { ...r };
  }
}
