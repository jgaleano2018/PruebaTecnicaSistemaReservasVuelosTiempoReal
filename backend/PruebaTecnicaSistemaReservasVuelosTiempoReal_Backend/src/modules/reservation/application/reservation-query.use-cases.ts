import { ReservationDto, TicketDto, UserRole } from '@reservas-vuelos/shared';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { Reservation } from '../domain/reservation.entities';
import { FlightReaderPort, ReservationRepository } from '../domain/reservation.ports';

export function toReservationDto(r: Reservation): ReservationDto {
  return {
    id: r.id,
    reservationCode: r.reservationCode,
    flightId: r.flightId,
    seatNumber: r.seatNumber,
    userId: r.userId,
    customerId: r.customerId,
    status: r.status,
    price: r.price,
    currency: r.currency,
    holdExpiresAt: r.holdExpiresAt.toISOString(),
    paymentId: r.paymentId,
    createdAt: r.createdAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString(),
  };
}

interface Requester {
  sub: string;
  role: UserRole;
}

function assertCanRead(r: Reservation, requester: Requester): void {
  if (requester.role !== UserRole.ADMIN && r.userId !== requester.sub) throw new ForbiddenError();
}

export class GetReservationUseCase {
  constructor(private readonly reservations: ReservationRepository) {}

  async execute(id: string, requester: Requester): Promise<ReservationDto> {
    const r = await this.reservations.findById(id);
    if (!r) throw new NotFoundError('Reserva', id);
    assertCanRead(r, requester);
    return toReservationDto(r);
  }
}

export class ListMyReservationsUseCase {
  constructor(private readonly reservations: ReservationRepository) {}

  async execute(userId: string): Promise<ReservationDto[]> {
    return (await this.reservations.findByUser(userId)).map(toReservationDto);
  }
}

/** HU3: boleto con código de reserva único. */
export class GetTicketUseCase {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly flights: FlightReaderPort,
  ) {}

  async byId(id: string, requester: Requester): Promise<TicketDto> {
    const r = await this.reservations.findById(id);
    if (!r) throw new NotFoundError('Reserva', id);
    assertCanRead(r, requester);
    return this.build(r);
  }

  async byCode(code: string, requester: Requester): Promise<TicketDto> {
    const r = await this.reservations.findByCode(code.toUpperCase());
    if (!r) throw new NotFoundError('Boleto', code);
    assertCanRead(r, requester);
    return this.build(r);
  }

  private async build(r: Reservation): Promise<TicketDto> {
    const flight = await this.flights.getFlight(r.flightId);
    return {
      reservationId: r.id,
      reservationCode: r.reservationCode ?? '',
      status: r.status,
      flight: {
        id: r.flightId,
        flightNumber: r.flightNumber,
        origin: flight?.originCode ?? '',
        destination: flight?.destinationCode ?? '',
        departureTime: flight?.departureTime.toISOString() ?? '',
        arrivalTime: flight?.arrivalTime.toISOString() ?? '',
      },
      seatNumber: r.seatNumber,
      cabinClass: r.cabinClass,
      passenger: r.passenger,
      price: r.price,
      currency: r.currency,
      paymentId: r.paymentId,
      confirmedAt: r.confirmedAt?.toISOString(),
    };
  }
}
