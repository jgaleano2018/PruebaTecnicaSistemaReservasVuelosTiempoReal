import { SeatAvailabilityDto, SeatDto, SeatMapDto, SeatStatus } from '@reservas-vuelos/shared';
import { Clock } from '../../../shared/application/clock.port';
import { NotFoundError } from '../../../shared/domain/errors';
import { SeatAvailabilityPort } from '../../flight/domain/flight.ports';
import { effectiveSeatStatus, toSeatDto } from '../domain/reservation.entities';
import { FlightReaderPort, SeatRepository } from '../domain/reservation.ports';

/** HU2: mapa interactivo de asientos de la aeronave. */
export class GetSeatMapUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly flights: FlightReaderPort,
    private readonly clock: Clock,
  ) {}

  async execute(flightId: string, requesterId?: string): Promise<SeatMapDto> {
    const flight = await this.flights.getFlight(flightId);
    if (!flight) throw new NotFoundError('Vuelo', flightId);
    const now = this.clock.now();
    const seats = await this.seats.findByFlight(flightId);
    const dtos = seats
      .sort((a, b) => a.row - b.row || a.column.localeCompare(b.column))
      .map((s) => toSeatDto(s, now, requesterId));
    const columns = [...new Set(seats.map((s) => s.column))].sort();
    return {
      flightId,
      flightNumber: flight.flightNumber,
      aircraft: flight.aircraftModel,
      columns,
      rows: seats.reduce((max, s) => Math.max(max, s.row), 0),
      seats: dtos,
      summary: summarize(dtos),
    };
  }
}

/** HU2 - Endpoint 1: información de un asiento puntual del mapa. */
export class GetSeatUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly clock: Clock,
  ) {}

  async execute(flightId: string, seatNumber: string, requesterId?: string): Promise<SeatDto> {
    const seat = await this.seats.findOne(flightId, seatNumber.toUpperCase());
    if (!seat) throw new NotFoundError('Asiento', `${flightId}/${seatNumber}`);
    return toSeatDto(seat, this.clock.now(), requesterId);
  }
}

/** Lista compacta de estados (endpoint interno para la proyección del Flight Management Service). */
export class GetSeatStatesUseCase {
  constructor(
    private readonly seats: SeatRepository,
    private readonly clock: Clock,
  ) {}

  async execute(flightId: string): Promise<{ seatNumber: string; status: SeatStatus }[]> {
    const now = this.clock.now();
    return (await this.seats.findByFlight(flightId)).map((s) => ({
      seatNumber: s.seatNumber,
      status: effectiveSeatStatus(s, now),
    }));
  }
}

/** Adaptador que el módulo de Reservas ofrece al módulo de Vuelos (disponibilidad en búsqueda). */
export class SeatAvailabilityService implements SeatAvailabilityPort {
  constructor(
    private readonly seats: SeatRepository,
    private readonly clock: Clock,
  ) {}

  getAvailability(flightIds: string[]): Promise<Map<string, SeatAvailabilityDto>> {
    return this.seats.countByFlights(flightIds, this.clock.now());
  }
}

export function summarize(seats: { status: SeatStatus }[]): SeatAvailabilityDto {
  const summary = { total: seats.length, available: 0, locked: 0, occupied: 0 };
  for (const s of seats) {
    if (s.status === SeatStatus.AVAILABLE) summary.available++;
    else if (s.status === SeatStatus.LOCKED) summary.locked++;
    else summary.occupied++;
  }
  return summary;
}
