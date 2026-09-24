import { DomainEvent } from '@reservas-vuelos/shared';
import { EventBus } from '../../application/event-bus.port';
import { logger } from '../logging/logger';
import { InMemoryEventBus } from './in-memory-event-bus';
import { KafkaEventBus } from './kafka-event-bus';

export interface EventBusConfig {
  kind: 'kafka' | 'memory';
  source: DomainEvent['source'];
  brokers: string;
  clientId: string;
  groupId: string;
  subscribeAll?: boolean;
  fromBeginning?: boolean;
}

/** Fábrica del adaptador de Event Bus según configuración (Kafka en ejecución real, memoria en pruebas). */
export function createEventBus(c: EventBusConfig): EventBus {
  if (c.kind === 'memory') return new InMemoryEventBus(c.source, undefined, c.subscribeAll);
  return new KafkaEventBus({
    clientId: c.clientId,
    brokers: c.brokers.split(',').map((b) => b.trim()),
    groupId: c.groupId,
    source: c.source,
    logger,
    subscribeAll: c.subscribeAll,
    fromBeginning: c.fromBeginning,
  });
}
