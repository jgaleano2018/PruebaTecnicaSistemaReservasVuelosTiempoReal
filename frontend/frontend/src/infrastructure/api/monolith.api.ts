import type {
  AircraftDto,
  AirportDto,
  AuthResponseDto,
  AuthUserDto,
  CustomerDto,
  DemandReportDto,
  FlightDto,
  FlightSearchQueryDto,
  LoginRequestDto,
  RegisterRequestDto,
  ReservationDto,
  RouteDto,
  SeatDto,
  SeatMapDto,
  TicketDto,
} from '@reservas-vuelos/shared';
import type {
  AnalyticsGateway,
  AuthGateway,
  CustomerGateway,
  FlightCatalogGateway,
  FlightMetricsDto,
  RealtimeStatusDto,
  ReservationGateway,
  SummaryReportDto,
} from '@/application/ports';
import type { HttpClient } from '../http/http-client';

/**
 * Adaptadores REST del Monolito Modular (http://localhost:3000/api/v1).
 * Un adaptador por módulo de negocio del diagrama: Vuelos, Reservas, Clientes, Dashboard (Analytics), Tiempo Real.
 */

const enc = encodeURIComponent;

export class MonolithAuthApi implements AuthGateway {
  constructor(private readonly http: HttpClient) {}
  login(input: LoginRequestDto) {
    return this.http.post<AuthResponseDto>('/auth/login', input, { auth: 'none' });
  }
  register(input: RegisterRequestDto) {
    return this.http.post<AuthResponseDto>('/auth/register', input, { auth: 'none' });
  }
  me() {
    return this.http.get<AuthUserDto>('/auth/me', { auth: 'required' });
  }
}

export class MonolithFlightApi implements FlightCatalogGateway {
  constructor(private readonly http: HttpClient) {}
  search(query: FlightSearchQueryDto) {
    return this.http.get<FlightDto[]>('/flights/search', {
      query: {
        origin: query.origin,
        destination: query.destination,
        date: query.date,
        cabinClass: query.cabinClass,
        maxPrice: query.maxPrice,
      },
    });
  }
  getFlight(flightId: string) {
    return this.http.get<FlightDto>(`/flights/${enc(flightId)}`);
  }
  airports() {
    return this.http.get<AirportDto[]>('/airports');
  }
  routes() {
    return this.http.get<RouteDto[]>('/routes');
  }
  aircraft() {
    return this.http.get<AircraftDto[]>('/aircraft');
  }
}

export class MonolithReservationApi implements ReservationGateway {
  constructor(private readonly http: HttpClient) {}
  seatMap(flightId: string) {
    return this.http.get<SeatMapDto>(`/flights/${enc(flightId)}/seats`, { auth: 'optional' });
  }
  seat(flightId: string, seatNumber: string) {
    return this.http.get<SeatDto>(`/flights/${enc(flightId)}/seats/${enc(seatNumber)}`, { auth: 'optional' });
  }
  myReservations() {
    return this.http.get<ReservationDto[]>('/reservations/me', { auth: 'required' });
  }
  reservation(reservationId: string) {
    return this.http.get<ReservationDto>(`/reservations/${enc(reservationId)}`, { auth: 'required' });
  }
  ticketByReservation(reservationId: string) {
    return this.http.get<TicketDto>(`/reservations/${enc(reservationId)}/ticket`, { auth: 'required' });
  }
  ticketByCode(reservationCode: string) {
    return this.http.get<TicketDto>(`/tickets/${enc(reservationCode.trim().toUpperCase())}`, { auth: 'required' });
  }
}

export class MonolithCustomerApi implements CustomerGateway {
  constructor(private readonly http: HttpClient) {}
  mine() {
    return this.http.get<CustomerDto[]>('/customers/me', { auth: 'required' });
  }
  byId(customerId: string) {
    return this.http.get<CustomerDto>(`/customers/${enc(customerId)}`, { auth: 'required' });
  }
  reservations(customerId: string) {
    return this.http.get<ReservationDto[]>(`/customers/${enc(customerId)}/reservations`, { auth: 'required' });
  }
  list(limit = 50, skip = 0) {
    return this.http.get<CustomerDto[]>('/customers', { auth: 'required', query: { limit, skip } });
  }
  updateContact(customerId: string, contact: { email?: string; phone?: string }) {
    return this.http.patch<CustomerDto>(`/customers/${enc(customerId)}/contact`, contact, { auth: 'required' });
  }
}

export class MonolithAnalyticsApi implements AnalyticsGateway {
  constructor(private readonly http: HttpClient) {}
  flightMetrics(flightId: string) {
    return this.http.get<FlightMetricsDto>(`/analytics/flights/${enc(flightId)}/metrics`);
  }
  demand(from?: string, to?: string) {
    return this.http.get<DemandReportDto[]>('/analytics/demand', { auth: 'required', query: { from, to } });
  }
  summary() {
    return this.http.get<SummaryReportDto>('/analytics/reports/summary', { auth: 'required' });
  }
  realtimeStatus() {
    return this.http.get<RealtimeStatusDto>('/realtime/status');
  }
}
