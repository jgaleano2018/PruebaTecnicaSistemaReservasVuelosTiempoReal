import {
  AirportDto,
  businessDayRange,
  FlightDto,
  FlightSearchQueryInput,
  FlightStatus,
  FlightStatusChangedPayload,
  SeatAvailabilityDto,
} from '@reservas-vuelos/shared';
import { NotFoundError } from '@reservas-vuelos/service-kernel';
import { Airport, Flight } from '../domain/flight.entity';
import { CatalogRepository, FlightRepository, SeatAvailabilityPort } from '../domain/flight.ports';

const EMPTY_AVAILABILITY: SeatAvailabilityDto = { total: 0, available: 0, locked: 0, occupied: 0 };

export function toFlightDto(
  flight: Flight,
  airports: Map<string, Airport>,
  availability?: SeatAvailabilityDto,
): FlightDto {
  const toAirport = (code: string): AirportDto | string => airports.get(code) ?? code;
  return {
    id: flight.id,
    flightNumber: flight.flightNumber,
    airline: flight.airline,
    origin: toAirport(flight.originCode),
    destination: toAirport(flight.destinationCode),
    departureTime: flight.departureTime.toISOString(),
    arrivalTime: flight.arrivalTime.toISOString(),
    durationMinutes: flight.durationMinutes,
    status: flight.status,
    delayMinutes: flight.delayMinutes,
    aircraft: flight.aircraftModel,
    fares: flight.fares,
    availability: availability ?? EMPTY_AVAILABILITY,
  };
}

/** HU1: búsqueda y filtro de vuelos por origen, destino y fecha. */
export class SearchFlightsUseCase {
  constructor(
    private readonly flights: FlightRepository,
    private readonly catalog: CatalogRepository,
    private readonly seats: SeatAvailabilityPort,
  ) {}

  async execute(query: FlightSearchQueryInput): Promise<FlightDto[]> {
    const { from, to } = businessDayRange(query.date);

    let flights = await this.flights.search({ origin: query.origin, destination: query.destination, from, to });

    if (query.cabinClass || query.maxPrice) {
      flights = flights.filter((f) =>
        f.fares.some(
          (fare) =>
            (!query.cabinClass || fare.cabinClass === query.cabinClass) &&
            (!query.maxPrice || fare.price <= query.maxPrice),
        ),
      );
    }

    const [airports, availability] = await Promise.all([
      this.catalog.findAirportsByCodes([query.origin, query.destination]),
      this.seats.getAvailability(flights.map((f) => f.id)),
    ]);
    const airportMap = new Map(airports.map((a) => [a.code, a]));

    return flights
      .sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime())
      .map((f) => toFlightDto(f, airportMap, availability.get(f.id)));
  }
}

export class GetFlightUseCase {
  constructor(
    private readonly flights: FlightRepository,
    private readonly catalog: CatalogRepository,
    private readonly seats: SeatAvailabilityPort,
  ) {}

  async execute(id: string): Promise<FlightDto> {
    const flight = await this.flights.findById(id);
    if (!flight) throw new NotFoundError('Vuelo', id);
    const [airports, availability] = await Promise.all([
      this.catalog.findAirportsByCodes([flight.originCode, flight.destinationCode]),
      this.seats.getAvailability([flight.id]),
    ]);
    return toFlightDto(flight, new Map(airports.map((a) => [a.code, a])), availability.get(flight.id));
  }
}

/** Lista vuelos en un rango (endpoint interno usado por el Flight Management Service para sincronizar). */
export class ListFlightsForSyncUseCase {
  constructor(
    private readonly flights: FlightRepository,
    private readonly seats: SeatAvailabilityPort,
  ) {}

  async execute(from: Date, to: Date): Promise<FlightDto[]> {
    const flights = await this.flights.findByDepartureRange(from, to);
    const availability = await this.seats.getAvailability(flights.map((f) => f.id));
    return flights.map((f) => toFlightDto(f, new Map(), availability.get(f.id)));
  }
}

/**
 * Consumidor del evento FlightStatusChanged (emitido por el Flight Management Service):
 * actualiza el estado en la colección `vuelos` para que la búsqueda (HU1) lo refleje.
 */
export class ApplyFlightStatusChangeUseCase {
  constructor(private readonly flights: FlightRepository) {}

  async execute(payload: FlightStatusChangedPayload): Promise<Flight | null> {
    const delay = payload.newStatus === FlightStatus.DELAYED ? payload.delayMinutes : undefined;
    return this.flights.updateStatus(payload.flightId, payload.newStatus, delay);
  }
}

export class GetCatalogUseCase {
  constructor(private readonly catalog: CatalogRepository) {}
  airports() {
    return this.catalog.findAirports();
  }
  routes() {
    return this.catalog.findRoutes();
  }
  aircraft() {
    return this.catalog.findAircraft();
  }
}
