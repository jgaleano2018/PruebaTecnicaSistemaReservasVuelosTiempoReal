import { Observable } from 'rxjs';
import { AnyDomainEvent, DomainEvent, EventPayloadMap, EventType } from '@reservas-vuelos/shared';

export type EventHandler<T extends EventType> = (event: DomainEvent<T>) => Promise<void>;

/**
 * Puerto de salida/entrada hacia el Event Bus (Kafka en producción, memoria en pruebas).
 * Los módulos de negocio solo dependen de esta interfaz.
 */
export interface EventBus {
  publish<T extends EventType>(type: T, key: string, payload: EventPayloadMap[T]): Promise<DomainEvent<T>>;
  subscribe<T extends EventType>(type: T, handler: EventHandler<T>): void;
  /** Flujo reactivo con todos los eventos publicados o recibidos por este servicio. */
  readonly events$: Observable<AnyDomainEvent>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
