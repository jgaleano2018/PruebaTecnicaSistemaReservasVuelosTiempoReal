import { Observable, Subject } from 'rxjs';
import { AnyDomainEvent, DomainEvent, EventPayloadMap, EventType } from '@reservas-vuelos/shared';
import { EventBus, EventHandler } from '../../application/event-bus.port';
import { createEvent } from './event-factory';

/**
 * Broker en memoria: simula Kafka entre varios buses dentro del mismo proceso
 * (se usa en pruebas de integración y en modo EVENT_BUS=memory).
 */
export class InMemoryBroker {
  private readonly buses = new Set<InMemoryEventBus>();
  private pending: Promise<void> = Promise.resolve();

  register(bus: InMemoryEventBus): void {
    this.buses.add(bus);
  }

  deliver(event: AnyDomainEvent): void {
    this.pending = this.pending.then(async () => {
      for (const bus of this.buses) await bus.receive(event);
    });
  }

  /** Espera a que se procesen todos los eventos encolados (incluidos los que se generen en cascada). */
  async drain(): Promise<void> {
    let current: Promise<void>;
    do {
      current = this.pending;
      await current;
      await new Promise((r) => setImmediate(r));
    } while (current !== this.pending);
  }
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventType, EventHandler<any>[]>();
  private readonly subject = new Subject<AnyDomainEvent>();
  readonly events$: Observable<AnyDomainEvent> = this.subject.asObservable();
  readonly published: AnyDomainEvent[] = [];

  constructor(
    private readonly source: DomainEvent['source'],
    private readonly broker: InMemoryBroker = new InMemoryBroker(),
    /** Equivalente a subscribeAll de Kafka: recibe todos los eventos aunque no tenga handlers (Realtime Gateway). */
    private readonly receiveAll = false,
  ) {
    broker.register(this);
  }

  subscribe<T extends EventType>(type: T, handler: EventHandler<T>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as EventHandler<any>);
    this.handlers.set(type, list);
  }

  async publish<T extends EventType>(type: T, key: string, payload: EventPayloadMap[T]): Promise<DomainEvent<T>> {
    const event = createEvent(type, key, payload, this.source);
    this.published.push(event as AnyDomainEvent);
    this.subject.next(event as AnyDomainEvent);
    this.broker.deliver(event as AnyDomainEvent);
    return event;
  }

  /** Invocado por el broker (equivale al consumidor Kafka). */
  async receive(event: AnyDomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    if (!handlers.length && !this.receiveAll) return;
    if (event.source !== this.source) this.subject.next(event);
    for (const h of handlers) {
      try {
        await h(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[InMemoryEventBus:${this.source}] handler ${event.type} falló`, err);
      }
    }
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    this.subject.complete();
  }
}
