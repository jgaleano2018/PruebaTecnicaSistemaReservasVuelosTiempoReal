import { Schema, model } from 'mongoose';
import { CabinClass, FlightStatus } from '@reservas-vuelos/shared';

const fareSchema = new Schema(
  {
    cabinClass: { type: String, enum: Object.values(CabinClass), required: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'COP' },
  },
  { _id: false },
);

/** Colección `vuelos` */
const flightSchema = new Schema(
  {
    _id: { type: String, required: true },
    flightNumber: { type: String, required: true },
    airline: { type: String, required: true },
    originCode: { type: String, required: true, uppercase: true },
    destinationCode: { type: String, required: true, uppercase: true },
    routeId: { type: String, required: true },
    aircraftId: { type: String, required: true },
    aircraftModel: { type: String, required: true },
    departureTime: { type: Date, required: true },
    arrivalTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    status: { type: String, enum: Object.values(FlightStatus), default: FlightStatus.SCHEDULED, index: true },
    delayMinutes: { type: Number },
    fares: { type: [fareSchema], required: true },
  },
  { collection: 'vuelos', timestamps: true, versionKey: false },
);
flightSchema.index({ originCode: 1, destinationCode: 1, departureTime: 1 });
flightSchema.index({ departureTime: 1 });

/** Colección `aeropuertos` */
const airportSchema = new Schema(
  {
    _id: { type: String, required: true }, // código IATA
    name: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
    timezone: { type: String, required: true },
  },
  { collection: 'aeropuertos', timestamps: true, versionKey: false },
);

/** Colección `rutas` */
const routeSchema = new Schema(
  {
    _id: { type: String, required: true }, // ej. BOG-MDE
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    distanceKm: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },
  },
  { collection: 'rutas', timestamps: true, versionKey: false },
);
routeSchema.index({ origin: 1, destination: 1 }, { unique: true });

/** Colección `aviones` */
const aircraftSchema = new Schema(
  {
    _id: { type: String, required: true },
    model: { type: String, required: true },
    registration: { type: String, required: true, unique: true },
    totalSeats: { type: Number, required: true },
    layout: [
      {
        _id: false,
        cabinClass: { type: String, enum: Object.values(CabinClass) },
        fromRow: Number,
        toRow: Number,
        columns: [String],
      },
    ],
  },
  { collection: 'aviones', timestamps: true, versionKey: false },
);

export const FlightModel = model('Flight', flightSchema);
export const AirportModel = model('Airport', airportSchema);
export const RouteModel = model('Route', routeSchema);
export const AircraftModel = model('Aircraft', aircraftSchema);
