import { FlightStatus } from '@reservas-vuelos/shared';
import { Aircraft, Airport, Flight, Route } from '../../domain/flight.entity';
import { CatalogRepository, FlightRepository, FlightSearchCriteria } from '../../domain/flight.ports';
import { AircraftModel, AirportModel, FlightModel, RouteModel } from './flight.schemas';

function toFlight(doc: any): Flight {
  return {
    id: doc._id,
    flightNumber: doc.flightNumber,
    airline: doc.airline,
    originCode: doc.originCode,
    destinationCode: doc.destinationCode,
    routeId: doc.routeId,
    aircraftId: doc.aircraftId,
    aircraftModel: doc.aircraftModel,
    departureTime: new Date(doc.departureTime),
    arrivalTime: new Date(doc.arrivalTime),
    durationMinutes: doc.durationMinutes,
    status: doc.status,
    delayMinutes: doc.delayMinutes ?? undefined,
    fares: (doc.fares ?? []).map((f: any) => ({ cabinClass: f.cabinClass, price: f.price, currency: f.currency })),
  };
}

export class MongoFlightRepository implements FlightRepository {
  async findById(id: string): Promise<Flight | null> {
    const doc = await FlightModel.findById(id).lean();
    return doc ? toFlight(doc) : null;
  }

  async search(c: FlightSearchCriteria): Promise<Flight[]> {
    const docs = await FlightModel.find({
      originCode: c.origin,
      destinationCode: c.destination,
      departureTime: { $gte: c.from, $lt: c.to },
    })
      .sort({ departureTime: 1 })
      .lean();
    return docs.map(toFlight);
  }

  async findByDepartureRange(from: Date, to: Date): Promise<Flight[]> {
    const docs = await FlightModel.find({ departureTime: { $gte: from, $lt: to } }).sort({ departureTime: 1 }).lean();
    return docs.map(toFlight);
  }

  async updateStatus(id: string, status: FlightStatus, delayMinutes?: number): Promise<Flight | null> {
    const update: any = { $set: { status } };
    if (delayMinutes !== undefined) update.$set.delayMinutes = delayMinutes;
    else update.$unset = { delayMinutes: 1 };
    const doc = await FlightModel.findByIdAndUpdate(id, update, { new: true }).lean();
    return doc ? toFlight(doc) : null;
  }
}

export class MongoCatalogRepository implements CatalogRepository {
  private toAirport = (d: any): Airport => ({ code: d._id, name: d.name, city: d.city, country: d.country, timezone: d.timezone });

  async findAirports(): Promise<Airport[]> {
    return (await AirportModel.find().sort({ _id: 1 }).lean()).map(this.toAirport);
  }

  async findAirportsByCodes(codes: string[]): Promise<Airport[]> {
    return (await AirportModel.find({ _id: { $in: codes } }).lean()).map(this.toAirport);
  }

  async findRoutes(): Promise<Route[]> {
    return (await RouteModel.find().sort({ _id: 1 }).lean()).map((d: any) => ({
      id: d._id,
      origin: d.origin,
      destination: d.destination,
      distanceKm: d.distanceKm,
      durationMinutes: d.durationMinutes,
    }));
  }

  private toAircraft = (d: any): Aircraft => ({
    id: d._id,
    model: d.model,
    registration: d.registration,
    totalSeats: d.totalSeats,
    layout: d.layout,
  });

  async findAircraft(): Promise<Aircraft[]> {
    return (await AircraftModel.find().lean()).map(this.toAircraft);
  }

  async findAircraftById(id: string): Promise<Aircraft | null> {
    const d = await AircraftModel.findById(id).lean();
    return d ? this.toAircraft(d) : null;
  }
}
