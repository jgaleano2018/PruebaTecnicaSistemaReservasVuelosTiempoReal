import { AnyDomainEvent, EventTypes, Rooms, ServerSocketEvents } from '@reservas-vuelos/shared';

export interface Dispatch {
  rooms: string[];
  event: string;
  data: unknown;
}

/**
 * Traduce cada evento de dominio (Kafka) a emisiones por sala (Socket.io / SSE).
 * Función pura => fácil de probar y reutilizable por ambos transportes.
 */
export function routeEvent(e: AnyDomainEvent): Dispatch[] {
  switch (e.type) {
    case EventTypes.SeatLocked: {
      const p = e.payload;
      return [{ rooms: [Rooms.flight(p.flightId), Rooms.dashboard(p.flightId), Rooms.dashboardAll()], event: ServerSocketEvents.SeatLocked, data: p }];
    }
    case EventTypes.SeatReleased: {
      const p = e.payload;
      return [{ rooms: [Rooms.flight(p.flightId), Rooms.dashboard(p.flightId), Rooms.dashboardAll()], event: ServerSocketEvents.SeatReleased, data: p }];
    }
    case EventTypes.ReservationConfirmed: {
      const p = e.payload;
      return [
        // Evento global: deshabilita el asiento para todos los clientes del vuelo
        { rooms: [Rooms.flight(p.flightId), Rooms.dashboard(p.flightId), Rooms.dashboardAll()], event: ServerSocketEvents.SeatOccupied, data: p },
        { rooms: [Rooms.reservation(p.reservationId), Rooms.user(p.userId)], event: ServerSocketEvents.ReservationConfirmed, data: p },
      ];
    }
    case EventTypes.ReservationFailed: {
      const p = e.payload;
      return [{ rooms: [Rooms.reservation(p.reservationId)], event: ServerSocketEvents.ReservationFailed, data: p }];
    }
    case EventTypes.FlightStatusChanged: {
      const p = e.payload;
      return [
        {
          rooms: [Rooms.flightsList(), Rooms.flight(p.flightId), Rooms.dashboard(p.flightId), Rooms.dashboardAll()],
          event: ServerSocketEvents.FlightStatusChanged,
          data: p,
        },
      ];
    }
    case EventTypes.PaymentProcessed: {
      // Se omiten los datos personales del pasajero
      const { passenger: _omit, ...p } = e.payload;
      return [{ rooms: [Rooms.reservation(p.reservationId), Rooms.user(p.userId)], event: ServerSocketEvents.PaymentProcessed, data: p }];
    }
    case EventTypes.FlightOccupancyUpdated: {
      const o = e.payload.occupancy;
      return [
        { rooms: [Rooms.dashboard(o.flightId), Rooms.dashboardAll(), Rooms.flightsList()], event: ServerSocketEvents.DashboardOccupancy, data: o },
      ];
    }
    default:
      return [];
  }
}
