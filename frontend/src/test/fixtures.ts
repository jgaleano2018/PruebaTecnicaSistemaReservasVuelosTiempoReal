import {
  CabinClass,
  FlightStatus,
  PaymentStatus,
  ReservationStatus,
  SeatPosition,
  SeatStatus,
  UserRole,
  type AuthResponseDto,
  type CheckoutHoldResponseDto,
  type FlightDto,
  type SeatDto,
  type SeatMapDto,
} from '@reservas-vuelos/shared';
import { summarize } from '@/domain/seat-map';

export const FLIGHT_ID = 'SA0140-20260925';

export function seat(seatNumber: string, overrides: Partial<SeatDto> = {}): SeatDto {
  const row = Number(seatNumber.slice(0, -1));
  const column = seatNumber.slice(-1);
  return {
    flightId: FLIGHT_ID,
    seatNumber,
    row,
    column,
    cabinClass: row <= 1 ? CabinClass.BUSINESS : CabinClass.ECONOMY,
    position: column === 'A' || column === 'F' ? SeatPosition.WINDOW : column === 'C' || column === 'D' ? SeatPosition.AISLE : SeatPosition.MIDDLE,
    price: 400000,
    currency: 'COP',
    status: SeatStatus.AVAILABLE,
    lockExpiresAt: null,
    lockedByMe: false,
    ...overrides,
  };
}

export function seatMap(seats: SeatDto[] = defaultSeats()): SeatMapDto {
  return {
    flightId: FLIGHT_ID,
    flightNumber: 'SA0140',
    aircraft: 'Airbus A320',
    columns: [...new Set(seats.map((s) => s.column))].sort(),
    rows: Math.max(...seats.map((s) => s.row)),
    seats,
    summary: summarize(seats),
  };
}

export function defaultSeats(): SeatDto[] {
  return [
    seat('1A'),
    seat('1C'),
    seat('1D'),
    seat('1F', { status: SeatStatus.OCCUPIED }),
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((c) => seat(`2${c}`)),
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((c) => seat(`3${c}`, c === 'B' ? { status: SeatStatus.LOCKED, lockExpiresAt: new Date(Date.now() + 300000).toISOString() } : {})),
  ];
}

export function flight(overrides: Partial<FlightDto> = {}): FlightDto {
  return {
    id: FLIGHT_ID,
    flightNumber: 'SA0140',
    airline: 'SkyAndes Airlines',
    origin: { code: 'BOG', name: 'El Dorado', city: 'Bogotá', country: 'Colombia', timezone: 'America/Bogota' },
    destination: { code: 'CTG', name: 'Rafael Núñez', city: 'Cartagena', country: 'Colombia', timezone: 'America/Bogota' },
    departureTime: '2026-09-25T13:25:00.000Z',
    arrivalTime: '2026-09-25T14:50:00.000Z',
    durationMinutes: 85,
    status: FlightStatus.SCHEDULED,
    aircraft: 'Airbus A320',
    fares: [
      { cabinClass: CabinClass.ECONOMY, price: 425000, currency: 'COP' },
      { cabinClass: CabinClass.BUSINESS, price: 1107000, currency: 'COP' },
    ],
    availability: { total: 16, available: 13, locked: 1, occupied: 2 },
    ...overrides,
  };
}

/** JWT sin firma válida (solo se decodifica `exp` en el cliente). */
export function fakeJwt(expSeconds = Math.floor(Date.now() / 1000) + 3600): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'user-1', exp: expSeconds })}.firma`;
}

export function authResponse(role: UserRole = UserRole.CUSTOMER, id = 'user-1'): AuthResponseDto {
  return {
    accessToken: fakeJwt(),
    expiresIn: '8h',
    user: { id, email: 'cliente@skyandes.com', fullName: 'Cliente Demo', role },
  };
}

export function holdResponse(seatNumber = '2C', userId = 'user-1'): CheckoutHoldResponseDto {
  const expiresAt = new Date(Date.now() + 7 * 60_000).toISOString();
  return {
    hold: {
      holdId: 'hold-1',
      reservationId: 'res-1',
      flightId: FLIGHT_ID,
      seatNumber,
      userId,
      price: 400000,
      currency: 'COP',
      expiresAt,
      status: ReservationStatus.PENDING_PAYMENT,
    },
    paymentIntent: {
      id: 'pi-1',
      reservationId: 'res-1',
      flightId: FLIGHT_ID,
      seatNumber,
      userId,
      amount: 400000,
      currency: 'COP',
      status: PaymentStatus.PENDING,
      expiresAt,
      createdAt: new Date().toISOString(),
    },
  };
}
