import { Admin, Consumer, Kafka, logLevel, Partitioners, Producer } from 'kafkajs';
import { defer, lastValueFrom, Observable, retry, Subject, timer } from 'rxjs';
import {
  ALL_TOPICS,
  AnyDomainEvent,
  DomainEvent,
  EventPayloadMap,
  EventType,
  eventTypeFromTopic,
  KafkaTopics,
} from '@reservas-vuelos/shared';
import { EventBus, EventHandler } from '../../application/event-bus.port';
import { createEvent } from './event-factory';
import type { Logger } from '../logging/logger';

export interface KafkaEventBusOptions {
  clientId: string;
  brokers: string[];
  groupId: string;
  source: DomainEvent['source'];
  logger: Logger;
  /** Si es true, el consumidor se suscribe a todos los tópicos (Realtime Gateway). */
  subscribeAll?: boolean;
  /**
   * true (por defecto): un grupo nuevo lee desde el inicio del tópico para no perder eventos publicados
   * antes de su primer arranque (los handlers son idempotentes). El Realtime Gateway usa false.
   */
  fromBeginning?: boolean;
}

/**
 * Adaptador Kafka del puerto EventBus.
 * - Producer idempotente, clave de partición = flightId (orden garantizado por vuelo).
 * - Consumer con grupo por servicio; cada handler se ejecuta de forma reactiva con reintentos.
 */
export class KafkaEventBus implements EventBus {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumer: Consumer;
  private readonly admin: Admin;
  private readonly handlers = new Map<EventType, EventHandler<any>[]>();
  private readonly subject = new Subject<AnyDomainEvent>();
  readonly events$: Observable<AnyDomainEvent> = this.subject.asObservable();

  constructor(private readonly opts: KafkaEventBusOptions) {
    this.kafka = new Kafka({
      clientId: opts.clientId,
      brokers: opts.brokers,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 500, retries: 15 },
    });
    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      createPartitioner: Partitioners.DefaultPartitioner,
      // El productor idempotente exige reintentos ilimitados para garantizar exactly-once por partición
      retry: { retries: Number.MAX_SAFE_INTEGER, initialRetryTime: 300, maxRetryTime: 30000 },
    });
    this.consumer = this.kafka.consumer({ groupId: opts.groupId, sessionTimeout: 30000 });
    this.admin = this.kafka.admin();
  }

  subscribe<T extends EventType>(type: T, handler: EventHandler<T>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as EventHandler<any>);
    this.handlers.set(type, list);
  }

  async publish<T extends EventType>(type: T, key: string, payload: EventPayloadMap[T]): Promise<DomainEvent<T>> {
    const event = createEvent(type, key, payload, this.opts.source);
    await this.producer.send({
      topic: KafkaTopics[type],
      messages: [
        {
          key,
          value: JSON.stringify(event),
          headers: { eventType: type, source: this.opts.source, eventId: event.eventId },
        },
      ],
    });
    this.opts.logger.info({ type, key, eventId: event.eventId }, 'Evento publicado en Kafka');
    this.subject.next(event as AnyDomainEvent);
    return event;
  }

  async start(): Promise<void> {
    await this.admin.connect();
    const existing = await this.admin.listTopics();
    const missing = ALL_TOPICS.filter((t) => !existing.includes(t));
    if (missing.length) {
      await this.admin
        .createTopics({ topics: missing.map((topic) => ({ topic, numPartitions: 3, replicationFactor: 1 })) })
        .catch((err) => this.opts.logger.warn({ err }, 'No se pudieron crear algunos tópicos (posiblemente ya existen)'));
    }
    await this.admin.disconnect();
    await this.producer.connect();

    const topics = this.opts.subscribeAll ? ALL_TOPICS : [...this.handlers.keys()].map((t) => KafkaTopics[t]);
    if (topics.length === 0) return;

    await this.consumer.connect();
    await this.consumer.subscribe({ topics, fromBeginning: this.opts.fromBeginning ?? true });
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const type = eventTypeFromTopic(topic);
        if (!type || !message.value) return;
        let event: AnyDomainEvent;
        try {
          event = JSON.parse(message.value.toString());
        } catch (err) {
          this.opts.logger.error({ err, topic }, 'Mensaje Kafka inválido, se descarta');
          return;
        }
        this.subject.next(event);
        await this.dispatch(event);
      },
    });
    this.opts.logger.info({ topics }, 'Consumidor Kafka suscrito');
  }

  private async dispatch(event: AnyDomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        await lastValueFrom(
          defer(() => handler(event)).pipe(retry({ count: 3, delay: (_err, attempt) => timer(attempt * 300) })),
          { defaultValue: undefined },
        );
      } catch (err) {
        // Dead-letter lógico: se registra y se continúa para no bloquear la partición.
        this.opts.logger.error({ err, eventId: event.eventId, type: event.type }, 'Handler falló tras reintentos');
      }
    }
  }

  async stop(): Promise<void> {
    await Promise.allSettled([this.consumer.disconnect(), this.producer.disconnect()]);
    this.subject.complete();
  }
}
