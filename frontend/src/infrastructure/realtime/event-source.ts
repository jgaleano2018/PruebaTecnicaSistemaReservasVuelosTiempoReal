import type { Unsubscribe } from '@/application/ports';

export type EventSourceFactory = (url: string) => EventSource;

export const defaultEventSourceFactory: EventSourceFactory = (url) => new EventSource(url);

export interface SseListenOptions {
  url: string;
  /** nombre del evento SSE -> manejador con el JSON ya parseado */
  events: Record<string, (data: unknown) => void>;
  onOpen?: () => void;
  onError?: (e: Event) => void;
  factory?: EventSourceFactory;
}

/**
 * Abre un stream Server-Sent Events y despacha los eventos con nombre.
 * EventSource reconecta solo (el backend envía `retry: 3000`).
 */
export function listenSse({ url, events, onOpen, onError, factory = defaultEventSourceFactory }: SseListenOptions): Unsubscribe {
  const source = factory(url);
  const listeners: [string, (e: MessageEvent) => void][] = Object.entries(events).map(([name, handler]) => [
    name,
    (e: MessageEvent) => {
      try {
        handler(JSON.parse(e.data as string));
      } catch {
        // Mensaje mal formado: se ignora sin romper el stream
      }
    },
  ]);
  for (const [name, fn] of listeners) source.addEventListener(name, fn as EventListener);
  if (onOpen) source.addEventListener('open', onOpen);
  if (onError) source.addEventListener('error', onError);
  return () => {
    for (const [name, fn] of listeners) source.removeEventListener(name, fn as EventListener);
    source.close();
  };
}
