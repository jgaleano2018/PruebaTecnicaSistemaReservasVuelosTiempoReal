import { ClientSocketEvents, Rooms, ServerSocketEvents } from '@reservas-vuelos/shared';
import type { RealtimeChannel, RealtimeEventName } from '@/application/ports';

/** Clave estable de un canal (misma convención de salas que el Realtime Gateway). */
export function channelKey(channel: RealtimeChannel): string {
  switch (channel.kind) {
    case 'flights':
      return Rooms.flightsList();
    case 'flight':
      return Rooms.flight(channel.flightId);
    case 'dashboard':
      return channel.flightId === 'all' ? Rooms.dashboardAll() : Rooms.dashboard(channel.flightId);
    case 'reservation':
      return Rooms.reservation(channel.reservationId);
  }
}

/** Mensaje Socket.io de suscripción/desuscripción para un canal. */
export function subscriptionMessages(channel: RealtimeChannel): { subscribe: string; unsubscribe?: string; arg?: string } {
  switch (channel.kind) {
    case 'flights':
      return { subscribe: ClientSocketEvents.SubscribeFlightsList, unsubscribe: ClientSocketEvents.UnsubscribeFlightsList };
    case 'flight':
      return { subscribe: ClientSocketEvents.SubscribeFlight, unsubscribe: ClientSocketEvents.UnsubscribeFlight, arg: channel.flightId };
    case 'dashboard':
      return { subscribe: ClientSocketEvents.SubscribeDashboard, unsubscribe: ClientSocketEvents.UnsubscribeDashboard, arg: channel.flightId };
    case 'reservation':
      // El gateway no ofrece desuscripción de reservas: la sala se abandona al desconectar
      return { subscribe: ClientSocketEvents.SubscribeReservation, arg: channel.reservationId };
  }
}

const FLIGHTS_LIST_EVENTS: ReadonlySet<string> = new Set([ServerSocketEvents.FlightStatusChanged, ServerSocketEvents.DashboardOccupancy]);

/**
 * Un socket recibe los eventos de TODAS sus salas por el mismo canal. Esta función decide
 * si un evento corresponde a un suscriptor concreto (p. ej. `seat:locked` del vuelo X no debe
 * modificar el mapa del vuelo Y aunque el socket también esté en `dashboard:all`).
 */
export function matchesChannel(channel: RealtimeChannel, event: RealtimeEventName, payload: unknown): boolean {
  const p = (payload ?? {}) as { flightId?: string; reservationId?: string };
  switch (channel.kind) {
    case 'flights':
      return FLIGHTS_LIST_EVENTS.has(event);
    case 'flight':
      return p.flightId === channel.flightId;
    case 'dashboard':
      return channel.flightId === 'all' ? p.flightId !== undefined : p.flightId === channel.flightId;
    case 'reservation':
      return p.reservationId === channel.reservationId;
  }
}

export const ALL_SERVER_EVENTS: RealtimeEventName[] = [
  ServerSocketEvents.SeatLocked,
  ServerSocketEvents.SeatReleased,
  ServerSocketEvents.SeatOccupied,
  ServerSocketEvents.FlightStatusChanged,
  ServerSocketEvents.ReservationConfirmed,
  ServerSocketEvents.ReservationFailed,
  ServerSocketEvents.PaymentProcessed,
  ServerSocketEvents.DashboardOccupancy,
];
