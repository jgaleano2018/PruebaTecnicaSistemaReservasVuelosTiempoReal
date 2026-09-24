import { Schema, model } from 'mongoose';
import { CabinClass, ReservationStatus, SeatPosition, SeatStatus } from '@reservas-vuelos/shared';

/** Colección `asientos`: un documento por asiento y vuelo. */
const seatSchema = new Schema(
  {
    flightId: { type: String, required: true },
    seatNumber: { type: String, required: true },
    row: { type: Number, required: true },
    column: { type: String, required: true },
    cabinClass: { type: String, enum: Object.values(CabinClass), required: true },
    position: { type: String, enum: Object.values(SeatPosition), required: true },
    price: { type: Number, required: true },
    currency: { type: String, required: true, default: 'COP' },
    status: { type: String, enum: Object.values(SeatStatus), default: SeatStatus.AVAILABLE },
    lockedByReservationId: { type: String, default: null },
    lockedByUserId: { type: String, default: null },
    lockExpiresAt: { type: Date, default: null },
    occupiedByReservationId: { type: String, default: null },
  },
  { collection: 'asientos', timestamps: true, versionKey: false },
);
// Unicidad física del asiento por vuelo: base de la protección contra double booking.
seatSchema.index({ flightId: 1, seatNumber: 1 }, { unique: true });
seatSchema.index({ flightId: 1, status: 1 });
seatSchema.index({ status: 1, lockExpiresAt: 1 });

const passengerSchema = new Schema(
  {
    firstName: String,
    lastName: String,
    documentType: String,
    documentNumber: String,
    email: String,
    phone: String,
    birthDate: String,
  },
  { _id: false },
);

/** Colección `reservas` */
const reservationSchema = new Schema(
  {
    _id: { type: String, required: true },
    reservationCode: { type: String },
    flightId: { type: String, required: true },
    flightNumber: { type: String, required: true },
    seatNumber: { type: String, required: true },
    cabinClass: { type: String, enum: Object.values(CabinClass), required: true },
    userId: { type: String, required: true },
    customerId: { type: String },
    passenger: { type: passengerSchema },
    status: { type: String, enum: Object.values(ReservationStatus), required: true },
    price: { type: Number, required: true },
    currency: { type: String, required: true },
    holdExpiresAt: { type: Date, required: true },
    paymentId: { type: String },
    failureReason: { type: String },
    createdAt: { type: Date, required: true },
    confirmedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { collection: 'reservas', versionKey: false },
);
reservationSchema.index({ reservationCode: 1 }, { unique: true, partialFilterExpression: { reservationCode: { $type: 'string' } } });
reservationSchema.index({ userId: 1, flightId: 1, status: 1 });
reservationSchema.index({ flightId: 1, status: 1 });
reservationSchema.index({ customerId: 1 });
reservationSchema.index({ status: 1, holdExpiresAt: 1 });

export const SeatModel = model('Seat', seatSchema);
export const ReservationModel = model('Reservation', reservationSchema);
