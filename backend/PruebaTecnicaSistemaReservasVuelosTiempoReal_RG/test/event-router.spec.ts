import { firstValueFrom, Subject, take, toArray } from 'rxjs';
import { AnyDomainEvent, EventTypes } from '@reservas-vuelos/shared';
import { routeEvent } from '../src/application/event-router';
import { RealtimeGatewayService } from '../src/application/realtime-gateway.service';

const ev = (type: string, payload: any): AnyDomainEvent =>
  ({ eventId: '1', type, version: 1, source: 'monolith', occurredAt: new Date().toISOString(), key: 'F1', payload }) as any;

describe('Realtime Gateway - enrutamiento de eventos', () => {
  it('SeatLocked va al mapa de asientos del vuelo y a los dashboards', () => {
    const [d] = routeEvent(ev(EventTypes.SeatLocked, { flightId: 'F1', seatNumber: '1A' }));
    expect(d.event).toBe('seat:locked');
    expect(d.rooms).toEqual(['flight:F1', 'dashboard:F1', 'dashboard:all']);
  });

  it('ReservationConfirmed genera un evento global (seat:occupied) y uno privado para el comprador', () => {
    const out = routeEvent(ev(EventTypes.ReservationConfirmed, { flightId: 'F1', seatNumber: '1A', reservationId: 'R1', userId: 'U1' }));
    expect(out.map((d) => d.event)).toEqual(['seat:occupied', 'reservation:confirmed']);
    expect(out[1].rooms).toEqual(['reservation:R1', 'user:U1']);
  });

  it('FlightStatusChanged llega a la lista de resultados de búsqueda', () => {
    const [d] = routeEvent(ev(EventTypes.FlightStatusChanged, { flightId: 'F1', newStatus: 'CANCELLED' }));
    expect(d.rooms).toContain('flights:list');
  });

  it('PaymentProcessed no expone datos personales del pasajero', () => {
    const [d] = routeEvent(ev(EventTypes.PaymentProcessed, { reservationId: 'R1', userId: 'U1', passenger: { documentNumber: '123' } }));
    expect(d.data).not.toHaveProperty('passenger');
  });

  it('forRoom filtra el stream reactivo por sala (SSE)', async () => {
    const source = new Subject<AnyDomainEvent>();
    const gw = new RealtimeGatewayService(source, 'test');
    const got = firstValueFrom(gw.forRoom('flight:F2').pipe(take(1), toArray()));
    source.next(ev(EventTypes.SeatLocked, { flightId: 'F1', seatNumber: '1A' }));
    source.next(ev(EventTypes.SeatReleased, { flightId: 'F2', seatNumber: '2C' }));
    const [d] = await got;
    expect(d.event).toBe('seat:released');
    expect(gw.stats.eventsReceived).toBe(2);
  });
});
