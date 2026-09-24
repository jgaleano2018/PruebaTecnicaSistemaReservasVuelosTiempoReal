import { filter, map, Observable, scan, shareReplay, startWith } from 'rxjs';
import { AnyDomainEvent, EventType } from '@reservas-vuelos/shared';
import { EventBus } from '../../../shared/application/event-bus.port';

export interface RealtimeStats {
  totalEvents: number;
  byType: Partial<Record<EventType, number>>;
  lastEventAt?: string;
}

function flightIdOf(e: AnyDomainEvent): string | undefined {
  if (e.type === 'FlightOccupancyUpdated') return e.payload.occupancy.flightId;
  return (e.payload as { flightId?: string }).flightId;
}

/**
 * Módulo de Tiempo Real del monolito: suscripción reactiva a todos los eventos de dominio
 * (publicados y consumidos por este servicio) para notificaciones en vivo y actualización de estados.
 * El broadcast masivo por WebSocket lo hace el microservicio Realtime Gateway.
 */
export class RealtimeHub {
  readonly stats$: Observable<RealtimeStats>;

  constructor(private readonly bus: EventBus) {
    this.stats$ = bus.events$.pipe(
      scan<AnyDomainEvent, RealtimeStats>(
        (acc, e) => ({
          totalEvents: acc.totalEvents + 1,
          byType: { ...acc.byType, [e.type]: (acc.byType[e.type] ?? 0) + 1 },
          lastEventAt: e.occurredAt,
        }),
        { totalEvents: 0, byType: {} },
      ),
      startWith<RealtimeStats>({ totalEvents: 0, byType: {} }),
      shareReplay(1),
    );
    // Mantiene el acumulado vivo aunque nadie consulte todavía.
    this.stats$.subscribe();
  }

  stream(opts: { flightId?: string; types?: EventType[] }): Observable<{ event: string; data: AnyDomainEvent; id: string }> {
    return this.bus.events$.pipe(
      filter((e) => !opts.flightId || flightIdOf(e) === opts.flightId),
      filter((e) => !opts.types?.length || opts.types.includes(e.type)),
      map((e) => ({ event: e.type, data: e, id: e.eventId })),
    );
  }
}
