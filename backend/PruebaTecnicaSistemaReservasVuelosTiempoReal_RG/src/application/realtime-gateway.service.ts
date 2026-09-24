import { filter, mergeMap, Observable, share, Subject } from 'rxjs';
import { AnyDomainEvent } from '@reservas-vuelos/shared';
import { Dispatch, routeEvent } from './event-router';

export interface GatewayStats {
  instanceId: string;
  connections: number;
  eventsReceived: number;
  dispatches: number;
  sseClients: number;
  startedAt: string;
}

/** Núcleo reactivo del gateway: eventos de dominio -> flujo de despachos por sala. */
export class RealtimeGatewayService {
  readonly dispatches$: Observable<Dispatch>;
  private readonly local = new Subject<AnyDomainEvent>();
  readonly stats: GatewayStats;

  constructor(events$: Observable<AnyDomainEvent>, instanceId: string) {
    this.stats = { instanceId, connections: 0, eventsReceived: 0, dispatches: 0, sseClients: 0, startedAt: new Date().toISOString() };
    this.dispatches$ = new Observable<AnyDomainEvent>((sub) => {
      const a = events$.subscribe(sub);
      const b = this.local.subscribe(sub);
      return () => {
        a.unsubscribe();
        b.unsubscribe();
      };
    }).pipe(
      mergeMap((e) => {
        this.stats.eventsReceived++;
        return routeEvent(e);
      }),
      share(),
    );
  }

  /** Flujo para una sala concreta (lo usa el transporte SSE). */
  forRoom(room: string): Observable<Dispatch> {
    return this.dispatches$.pipe(filter((d) => d.rooms.includes(room)));
  }

  /** Permite inyectar eventos (pruebas / modo memoria). */
  inject(e: AnyDomainEvent) {
    this.local.next(e);
  }
}
