import type {
  AircraftDto,
  AirportDto,
  AuthResponseDto,
  AuthUserDto,
  CheckoutHoldResponseDto,
  CustomerDto,
  DashboardOverviewDto,
  DemandReportDto,
  FlightDto,
  FlightOccupancyDto,
  FlightSearchQueryDto,
  FlightStatus,
  FlightStatusHistoryDto,
  LoginRequestDto,
  PaymentDto,
  PaymentIntentDto,
  ProcessPaymentRequestDto,
  RefundDto,
  RegisterRequestDto,
  ReservationDto,
  RouteDto,
  SeatDto,
  SeatMapDto,
  ServerToClientEvents,
  TicketDto,
  UpdateFlightStatusRequestDto,
} from '@reservas-vuelos/shared';

/**
 * Puertos de la capa de aplicación (arquitectura limpia / hexagonal en el cliente).
 * La UI depende SOLO de estas interfaces; los adaptadores HTTP / Socket.io / SSE
 * viven en `infrastructure/` y se conectan en el composition root (`app/container.ts`).
 * Cada puerto corresponde a un módulo o servicio del diagrama de arquitectura.
 */

export type Unsubscribe = () => void;

/* ------------------------- Monolito modular ------------------------- */

/** Monolito · autenticación JWT (Capa de Infraestructura) */
export interface AuthGateway {
  login(input: LoginRequestDto): Promise<AuthResponseDto>;
  register(input: RegisterRequestDto): Promise<AuthResponseDto>;
  me(): Promise<AuthUserDto>;
}

/** Monolito · Módulo de Vuelos (Flight) */
export interface FlightCatalogGateway {
  search(query: FlightSearchQueryDto): Promise<FlightDto[]>;
  getFlight(flightId: string): Promise<FlightDto>;
  airports(): Promise<AirportDto[]>;
  routes(): Promise<RouteDto[]>;
  aircraft(): Promise<AircraftDto[]>;
}

/**
 * Monolito · Módulo de Reservas (Reservation). Solo lectura desde el frontend:
 * el bloqueo y su liberación pasan SIEMPRE por el Payment Service (CheckoutGateway), según el diagrama.
 */
export interface ReservationGateway {
  seatMap(flightId: string): Promise<SeatMapDto>;
  seat(flightId: string, seatNumber: string): Promise<SeatDto>;
  myReservations(): Promise<ReservationDto[]>;
  reservation(reservationId: string): Promise<ReservationDto>;
  ticketByReservation(reservationId: string): Promise<TicketDto>;
  ticketByCode(reservationCode: string): Promise<TicketDto>;
}

/** Monolito · Módulo de Clientes (Customer) */
export interface CustomerGateway {
  mine(): Promise<CustomerDto[]>;
  byId(customerId: string): Promise<CustomerDto>;
  reservations(customerId: string): Promise<ReservationDto[]>;
  list(limit?: number, skip?: number): Promise<CustomerDto[]>;
  updateContact(customerId: string, contact: { email?: string; phone?: string }): Promise<CustomerDto>;
}

export interface FlightMetricsDto {
  flightId: string;
  total: number;
  available: number;
  locked: number;
  occupied: number;
  occupancyRate: number;
  confirmedReservations: number;
  pendingHolds: number;
  expiredHolds: number;
  revenue: number;
  currency: string;
  conversionRate: number;
}

export interface SummaryReportDto {
  totalFlights: number;
  confirmedReservations: number;
  revenue: number;
  currency: string;
  reservationsByStatus: Record<string, number>;
  flightsByStatus: Record<string, number>;
}

export interface RealtimeStatusDto {
  consumes: string[];
  publishes: string[];
  stats: { totalEvents: number; byType: Record<string, number>; lastEventAt?: string };
  gateway: string;
}

/** Monolito · Módulo de Dashboard (Analytics) + Módulo de Tiempo Real (estado) */
export interface AnalyticsGateway {
  flightMetrics(flightId: string): Promise<FlightMetricsDto>;
  demand(from?: string, to?: string): Promise<DemandReportDto[]>;
  summary(): Promise<SummaryReportDto>;
  realtimeStatus(): Promise<RealtimeStatusDto>;
}

/* ------------------------- Microservicios ------------------------- */

/** Payment Service: bloqueo (vía Reservas) + intención de pago, pagos y reembolsos */
export interface CheckoutGateway {
  createHold(flightId: string, seatNumber: string): Promise<CheckoutHoldResponseDto>;
  releaseHold(reservationId: string): Promise<unknown>;
  paymentIntent(intentId: string): Promise<PaymentIntentDto>;
  pay(input: ProcessPaymentRequestDto): Promise<PaymentDto>;
  myPayments(): Promise<PaymentDto[]>;
  payment(paymentId: string): Promise<PaymentDto>;
  refund(paymentId: string, reason: string): Promise<RefundDto>;
}

/** Vuelo gestionado por el FMS (colección `vuelos_gestion` en flight-db). */
export interface ManagedFlightDto {
  id: string;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  aircraft: string;
  status: FlightStatus;
  delayMinutes?: number;
  lastSyncedAt?: string;
  updatedAt?: string;
}

export interface SyncLogDto {
  type: 'CATALOG' | 'AIRLINE';
  flights: number;
  changes: number;
  details?: unknown;
  at: string;
}

export interface OccupancyStreamHandlers {
  onSnapshot?: (o: FlightOccupancyDto) => void;
  onOccupancy: (o: FlightOccupancyDto) => void;
  onError?: (e: Event) => void;
  onOpen?: () => void;
}

/** Flight Management Service: gestión avanzada de vuelos + dashboard de ocupación (HU4) */
export interface FlightManagementGateway {
  overview(hoursAhead?: number): Promise<DashboardOverviewDto>;
  flightsOccupancy(date?: string): Promise<FlightOccupancyDto[]>;
  occupancy(flightId: string): Promise<FlightOccupancyDto>;
  /** SSE: snapshot + cada cambio (un vuelo) o todos los vuelos si flightId es undefined */
  streamOccupancy(flightId: string | undefined, handlers: OccupancyStreamHandlers): Unsubscribe;
  flights(filter: { date?: string; status?: FlightStatus; origin?: string; destination?: string }): Promise<ManagedFlightDto[]>;
  flight(flightId: string): Promise<ManagedFlightDto>;
  statusHistory(flightId: string): Promise<FlightStatusHistoryDto[]>;
  changeStatus(flightId: string, input: UpdateFlightStatusRequestDto): Promise<unknown>;
  syncFlights(): Promise<{ synchronized: number }>;
  syncAirlines(): Promise<unknown>;
  syncLog(): Promise<SyncLogDto[]>;
}

/* ------------------------- Realtime Gateway ------------------------- */

export type RealtimeChannel =
  | { kind: 'flights' }
  | { kind: 'flight'; flightId: string }
  | { kind: 'dashboard'; flightId: string | 'all' }
  | { kind: 'reservation'; reservationId: string };

export type RealtimeEventName = Exclude<keyof ServerToClientEvents, 'gateway:connected'>;
export type RealtimePayload<E extends RealtimeEventName> = Parameters<ServerToClientEvents[E]>[0];
export type RealtimeHandlers = { [E in RealtimeEventName]?: (payload: RealtimePayload<E>) => void };

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/**
 * Cliente de tiempo real (Realtime Gateway): WebSocket (Socket.io) o SSE.
 * Kafka nunca se expone al navegador: el gateway consume los tópicos y los reenvía por salas.
 */
export interface RealtimeClient {
  readonly transport: 'websocket' | 'sse';
  connect(token?: string | null): void;
  disconnect(): void;
  subscribe(channel: RealtimeChannel, handlers: RealtimeHandlers): Unsubscribe;
  onConnectionChange(listener: (state: ConnectionState) => void): Unsubscribe;
  /** Se invoca tras una reconexión: la UI re-sincroniza su estado con REST (se pudieron perder eventos). */
  onResync(listener: () => void): Unsubscribe;
}

/* ------------------------- Almacenamiento ------------------------- */

export interface KeyValueStore<T> {
  get(): T | null;
  set(value: T): void;
  clear(): void;
}

/** Contenedor de dependencias que recibe la UI. */
export interface Services {
  auth: AuthGateway;
  flights: FlightCatalogGateway;
  reservations: ReservationGateway;
  customers: CustomerGateway;
  analytics: AnalyticsGateway;
  checkout: CheckoutGateway;
  flightManagement: FlightManagementGateway;
  realtime: RealtimeClient;
}
