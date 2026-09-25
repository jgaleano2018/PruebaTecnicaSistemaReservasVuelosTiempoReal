import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ConnectionState, RealtimeChannel, RealtimeEventName, RealtimeHandlers } from '../ports';
import { useServices } from '../services-context';

/**
 * Suscribe un componente a un canal del Realtime Gateway mientras está montado.
 * Los manejadores se leen desde una ref, así que pueden cambiar en cada render sin re-suscribir.
 * `channel = null` desactiva la suscripción.
 */
export function useRealtimeChannel(channel: RealtimeChannel | null, handlers: RealtimeHandlers): void {
  const { realtime } = useServices();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const key = channel ? JSON.stringify(channel) : null;

  useEffect(() => {
    if (!channel) return;
    const proxy: RealtimeHandlers = {};
    for (const name of Object.keys(handlers) as RealtimeEventName[]) {
      (proxy as Record<string, (p: unknown) => void>)[name] = (payload: unknown) =>
        (handlersRef.current[name] as ((p: unknown) => void) | undefined)?.(payload);
    }
    return realtime.subscribe(channel, proxy);
    // La suscripción depende del canal (key) y de qué eventos se escuchan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime, key, Object.keys(handlers).sort().join('|')]);
}

export function useConnectionState(): ConnectionState {
  const { realtime } = useServices();
  const [state, setState] = useState<ConnectionState>('disconnected');
  useEffect(() => realtime.onConnectionChange(setState), [realtime]);
  return state;
}

/** Tras reconectar, se invalidan las consultas activas para recuperar eventos perdidos. */
export function useResyncOnReconnect(): void {
  const { realtime } = useServices();
  const queryClient = useQueryClient();
  useEffect(() => realtime.onResync(() => void queryClient.invalidateQueries()), [realtime, queryClient]);
}
