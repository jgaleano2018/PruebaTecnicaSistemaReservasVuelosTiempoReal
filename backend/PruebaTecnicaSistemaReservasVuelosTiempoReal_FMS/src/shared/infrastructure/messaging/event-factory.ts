import { randomUUID } from 'crypto';
import { DomainEvent, EventPayloadMap, EventType } from '@reservas-vuelos/shared';

export function createEvent<T extends EventType>(
  type: T,
  key: string,
  payload: EventPayloadMap[T],
  source: DomainEvent['source'],
): DomainEvent<T> {
  return {
    eventId: randomUUID(),
    type,
    version: 1,
    source,
    occurredAt: new Date().toISOString(),
    key,
    payload,
  };
}
