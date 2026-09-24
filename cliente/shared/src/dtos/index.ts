import {
  CabinClass,
  FlightStatus,
  PaymentStatus,
  ReservationStatus,
  SeatPosition,
  SeatStatus,
  UserRole,
} from '../enums';

/* ------------------------------------------------------------------ */
/* Comunes                                                             */
/* ------------------------------------------------------------------ */

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface MoneyDto {
  amount: number;
  currency: string;
}

/* ------------------------------------------------------------------ */
/* Autenticación                                                       */
/* ------------------------------------------------------------------ */

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface RegisterRequestDto {
  email: string;
  password: string;
  fullName: string;
}

export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthResponseDto {
  accessToken: string;
  expiresIn: string;
  user: AuthUserDto;
}

/** Contenido del JWT compartido por el monolito y los microservicios. */
export interface JwtPayloadDto {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
}

/* ------------------------------------------------------------------ */
/* Catálogo: aeropuertos, rutas, aviones                               */
/* ------------------------------------------------------------------ */

export interface AirportDto {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export interface RouteDto {
  id: string;
  origin: string;
  destination: string;
  distanceKm: number;
  durationMinutes: number;
}

export interface AircraftDto {
  id: string;
  model: string;
  registration: string;
  totalSeats: number;
}

/* ------------------------------------------------------------------ */
/* Historia de Usuario 1: Búsqueda y filtro de vuelos                  */
/* ------------------------------------------------------------------ */

export interface FlightSearchQueryDto {
  origin: string;
  destination: string;
  /** Fecha en formato YYYY-MM-DD */
  date: string;
  cabinClass?: CabinClass;
  maxPrice?: number;
}

export interface FareDto {
  cabinClass: CabinClass;
  price: number;
  currency: string;
}

export interface SeatAvailabilityDto {
  total: number;
  available: number;
  locked: number;
  occupied: number;
}

export interface FlightDto {
  id: string;
  flightNumber: string;
  airline: string;
  origin: AirportDto | string;
  destination: AirportDto | string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  status: FlightStatus;
  delayMinutes?: number;
  aircraft: string;
  fares: FareDto[];
  availability: SeatAvailabilityDto;
}

/* ------------------------------------------------------------------ */
/* Historia de Usuario 2: Mapa de asientos y bloqueo temporal          */
/* ------------------------------------------------------------------ */

export interface SeatDto {
  flightId: string;
  seatNumber: string;
  row: number;
  column: string;
  cabinClass: CabinClass;
  position: SeatPosition;
  price: number;
  currency: string;
  status: SeatStatus;
  /** Fecha ISO en la que expira el bloqueo (solo si status = LOCKED) */
  lockExpiresAt?: string | null;
  /** true si el bloqueo pertenece al usuario autenticado que consulta */
  lockedByMe?: boolean;
}

export interface SeatMapDto {
  flightId: string;
  flightNumber: string;
  aircraft: string;
  columns: string[];
  rows: number;
  seats: SeatDto[];
  summary: SeatAvailabilityDto;
}

export interface CreateSeatHoldRequestDto {
  flightId: string;
  seatNumber: string;
}

export interface SeatHoldDto {
  holdId: string;
  reservationId: string;
  flightId: string;
  seatNumber: string;
  userId: string;
  price: number;
  currency: string;
  expiresAt: string;
  status: ReservationStatus;
}

/** Respuesta del Payment Service al crear un bloqueo + intención de pago. */
export interface CheckoutHoldResponseDto {
  hold: SeatHoldDto;
  paymentIntent: PaymentIntentDto;
}

/* ------------------------------------------------------------------ */
/* Historia de Usuario 3: Confirmación y pago                          */
/* ------------------------------------------------------------------ */

export interface PassengerDto {
  firstName: string;
  lastName: string;
  documentType: 'CC' | 'CE' | 'PASSPORT' | 'TI';
  documentNumber: string;
  email: string;
  phone?: string;
  birthDate?: string;
}

/** Datos ficticios de tarjeta. Nunca se almacenan completos. */
export interface CardDto {
  number: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
}

export interface PaymentIntentDto {
  id: string;
  reservationId: string;
  flightId: string;
  seatNumber: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  expiresAt: string;
  createdAt: string;
}

export interface ProcessPaymentRequestDto {
  paymentIntentId: string;
  passenger: PassengerDto;
  card: CardDto;
}

export interface PaymentDto {
  id: string;
  paymentIntentId: string;
  reservationId: string;
  flightId: string;
  seatNumber: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  cardBrand: string;
  cardLast4: string;
  authorizationCode?: string;
  declineReason?: string;
  createdAt: string;
}

export interface RefundDto {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface TicketDto {
  reservationId: string;
  reservationCode: string;
  status: ReservationStatus;
  flight: {
    id: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
  };
  seatNumber: string;
  cabinClass: CabinClass;
  passenger?: PassengerDto;
  price: number;
  currency: string;
  paymentId?: string;
  confirmedAt?: string;
}

export interface ReservationDto {
  id: string;
  reservationCode?: string;
  flightId: string;
  seatNumber: string;
  userId: string;
  customerId?: string;
  status: ReservationStatus;
  price: number;
  currency: string;
  holdExpiresAt: string;
  paymentId?: string;
  createdAt: string;
  confirmedAt?: string;
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export interface CustomerDto {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone?: string;
  reservationsCount: number;
}

/* ------------------------------------------------------------------ */
/* Historia de Usuario 4: Dashboard / estado del vuelo                 */
/* ------------------------------------------------------------------ */

export interface FlightOccupancyDto {
  flightId: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  status: FlightStatus;
  total: number;
  available: number;
  locked: number;
  occupied: number;
  occupancyRate: number;
  updatedAt: string;
}

export interface DashboardOverviewDto {
  totalFlights: number;
  totalSeats: number;
  available: number;
  locked: number;
  occupied: number;
  occupancyRate: number;
  flightsByStatus: Record<string, number>;
  topFlights: FlightOccupancyDto[];
  updatedAt: string;
}

export interface UpdateFlightStatusRequestDto {
  status: FlightStatus;
  delayMinutes?: number;
  reason?: string;
}

export interface FlightStatusHistoryDto {
  flightId: string;
  previousStatus: FlightStatus;
  newStatus: FlightStatus;
  delayMinutes?: number;
  reason?: string;
  changedBy: string;
  changedAt: string;
}

export interface DemandReportDto {
  route: string;
  reservations: number;
  revenue: number;
  currency: string;
}
