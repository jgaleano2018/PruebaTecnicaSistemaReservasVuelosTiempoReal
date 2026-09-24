import { FlightStatus, PassengerDto, ReservationStatus, SeatAvailabilityDto } from '@reservas-vuelos/shared';
import { Reservation, Seat } from './reservation.entities';

export interface LockSeatCommand {
  flightId: string;
  seatNumber: string;
  reservationId: string;
  userId: string;
  expiresAt: Date;
  now: Date;
}

/**
 * Puerto de persistencia de asientos. Todas las operaciones de cambio de estado
 * DEBEN ser atómicas (compare-and-set) para impedir sobre-reservas.
 */
export interface SeatRepository {
  findByFlight(flightId: string): Promise<Seat[]>;
  findOne(flightId: string, seatNumber: string): Promise<Seat | null>;
  /** AVAILABLE (o LOCKED vencido) -> LOCKED. Devuelve null si otro usuario lo tiene. */
  tryLock(cmd: LockSeatCommand): Promise<Seat | null>;
  /** LOCKED por reservationId -> AVAILABLE. */
  releaseLock(flightId: string, seatNumber: string, reservationId: string): Promise<boolean>;
  /** LOCKED vencido por reservationId -> AVAILABLE (solo si sigue vencido). */
  releaseExpiredLock(flightId: string, seatNumber: string, reservationId: string, now: Date): Promise<boolean>;
  /** LOCKED por reservationId, o AVAILABLE -> OCCUPIED. */
  occupy(flightId: string, seatNumber: string, reservationId: string, now: Date): Promise<Seat | null>;
  /** OCCUPIED por reservationId -> AVAILABLE (reembolso). */
  releaseOccupied(flightId: string, seatNumber: string, reservationId: string): Promise<boolean>;
  findExpiredLocks(now: Date, limit: number): Promise<Seat[]>;
  countByFlights(flightIds: string[], now: Date): Promise<Map<string, SeatAvailabilityDto>>;
}

export interface ReservationRepository {
  nextId(): string;
  create(reservation: Reservation): Promise<Reservation>;
  findById(id: string): Promise<Reservation | null>;
  findByCode(code: string): Promise<Reservation | null>;
  findByUser(userId: string): Promise<Reservation[]>;
  findByCustomer(customerId: string): Promise<Reservation[]>;
  findActiveHold(userId: string, flightId: string, seatNumber: string, now: Date): Promise<Reservation | null>;
  countActiveHolds(userId: string, flightId: string, now: Date): Promise<number>;
  findPendingByFlight(flightId: string): Promise<Reservation[]>;
  /** Marca como EXPIRED las reservas pendientes cuyo bloqueo venció (p. ej. el asiento fue re-bloqueado por otro). */
  expireStalePending(now: Date): Promise<number>;
  /** Transición atómica de estado: solo aplica si el estado actual está en `from`. */
  transition(id: string, from: ReservationStatus[], patch: Partial<Reservation>): Promise<Reservation | null>;
}

/** Puerto hacia el módulo de Vuelos. */
export interface FlightReaderPort {
  getFlight(flightId: string): Promise<{
    id: string;
    flightNumber: string;
    status: FlightStatus;
    departureTime: Date;
    arrivalTime: Date;
    originCode: string;
    destinationCode: string;
    aircraftModel: string;
  } | null>;
}

/** Puerto hacia el módulo de Clientes. */
export interface CustomerRegistryPort {
  registerPassenger(passenger: PassengerDto, userId: string): Promise<{ customerId: string }>;
  incrementReservations(customerId: string): Promise<void>;
}
