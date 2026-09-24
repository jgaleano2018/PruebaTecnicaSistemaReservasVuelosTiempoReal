import {
  FlightOccupancyUpdatedPayload,
  FlightStatusChangedPayload,
  PaymentProcessedPayload,
  ReservationConfirmedPayload,
  ReservationFailedPayload,
  SeatLockedPayload,
  SeatReleasedPayload,
} from '../events';

/** Mensajes que el cliente (web, mobile, dashboard) envía al Realtime Gateway (Socket.io). */
export const ClientSocketEvents = {
  SubscribeFlight: 'subscribe:flight',
  UnsubscribeFlight: 'unsubscribe:flight',
  SubscribeFlightsList: 'subscribe:flights',
  UnsubscribeFlightsList: 'unsubscribe:flights',
  SubscribeDashboard: 'subscribe:dashboard',
  UnsubscribeDashboard: 'unsubscribe:dashboard',
  SubscribeReservation: 'subscribe:reservation',
} as const;

/** Mensajes que el Realtime Gateway emite hacia los clientes conectados. */
export const ServerSocketEvents = {
  Connected: 'gateway:connected',
  SeatLocked: 'seat:locked',
  SeatReleased: 'seat:released',
  SeatOccupied: 'seat:occupied',
  FlightStatusChanged: 'flight:status-changed',
  ReservationConfirmed: 'reservation:confirmed',
  ReservationFailed: 'reservation:failed',
  PaymentProcessed: 'payment:processed',
  DashboardOccupancy: 'dashboard:occupancy',
} as const;

/** Salas (rooms) de Socket.io / canales SSE. */
export const Rooms = {
  flight: (flightId: string) => `flight:${flightId}`,
  flightsList: () => 'flights:list',
  dashboard: (flightId: string) => `dashboard:${flightId}`,
  dashboardAll: () => 'dashboard:all',
  reservation: (reservationId: string) => `reservation:${reservationId}`,
  user: (userId: string) => `user:${userId}`,
};

export interface ServerToClientEvents {
  'gateway:connected': (data: { socketId: string; instanceId: string }) => void;
  'seat:locked': (data: SeatLockedPayload) => void;
  'seat:released': (data: SeatReleasedPayload) => void;
  'seat:occupied': (data: ReservationConfirmedPayload) => void;
  'flight:status-changed': (data: FlightStatusChangedPayload) => void;
  'reservation:confirmed': (data: ReservationConfirmedPayload) => void;
  'reservation:failed': (data: ReservationFailedPayload) => void;
  'payment:processed': (data: Omit<PaymentProcessedPayload, 'passenger'>) => void;
  'dashboard:occupancy': (data: FlightOccupancyUpdatedPayload['occupancy']) => void;
}

export interface ClientToServerEvents {
  'subscribe:flight': (flightId: string, ack?: (res: { ok: boolean; room: string }) => void) => void;
  'unsubscribe:flight': (flightId: string) => void;
  'subscribe:flights': (ack?: (res: { ok: boolean; room: string }) => void) => void;
  'unsubscribe:flights': () => void;
  'subscribe:dashboard': (flightId: string | 'all', ack?: (res: { ok: boolean; room: string }) => void) => void;
  'unsubscribe:dashboard': (flightId: string | 'all') => void;
  'subscribe:reservation': (reservationId: string, ack?: (res: { ok: boolean; room: string }) => void) => void;
}
