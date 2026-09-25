import type {
  ConnectionState,
  RealtimeChannel,
  RealtimeClient,
  RealtimeHandlers,
  Unsubscribe,
} from '@/application/ports';
import { buildUrl } from '../http/http-client';
import { ALL_SERVER_EVENTS, channelKey } from './channel-matching';
import { defaultEventSourceFactory, listenSse, type EventSourceFactory } from './event-source';
import { ListenerRegistry } from './listener-registry';

/**
 * Transporte alterno Server-Sent Events (respaldo cuando WebSocket no está disponible).
 * Todo llega desde el Realtime Gateway (`/api/v1/sse/...`), igual que por WebSocket:
 * - Vuelos, lista y dashboard: un EventSource por canal activo (con conteo de referencias).
 * - Reservas: el gateway no publica un SSE por reserva y el SSE del monolito es público
 *   (expondría eventos de otros usuarios), así que la confirmación se resuelve con la
 *   consulta REST periódica de `useAwaitConfirmation` y con `seat:occupied` en la sala del vuelo.
 */
export class SseRealtimeClient implements RealtimeClient {
  readonly transport = 'sse' as const;
  private readonly registry = new ListenerRegistry();
  private readonly streams = new Map<string, Unsubscribe>();
  private readonly openStreams = new Set<string>();
  private active = false;

  constructor(
    private readonly gatewayApiUrl: string,
    private readonly factory: EventSourceFactory = defaultEventSourceFactory,
  ) {}

  connect(): void {
    if (this.active) return;
    this.active = true;
    this.registry.setState('connecting');
    for (const channel of this.registry.activeChannels()) this.open(channel);
    if (this.streams.size === 0) this.registry.setState('connected');
  }

  disconnect(): void {
    this.active = false;
    for (const close of this.streams.values()) close();
    this.streams.clear();
    this.openStreams.clear();
    this.registry.setState('disconnected');
  }

  subscribe(channel: RealtimeChannel, handlers: RealtimeHandlers): Unsubscribe {
    const { entry, first } = this.registry.add(channel, handlers);
    if (first && this.active) this.open(channel);
    return () => {
      if (this.registry.remove(entry)) this.close(channel);
    };
  }

  onConnectionChange(listener: (s: ConnectionState) => void): Unsubscribe {
    return this.registry.onConnectionChange(listener);
  }

  onResync(listener: () => void): Unsubscribe {
    return this.registry.onResync(listener);
  }

  private urlFor(channel: RealtimeChannel): string | null {
    switch (channel.kind) {
      case 'flights':
        return buildUrl(this.gatewayApiUrl, '/sse/flights');
      case 'flight':
        return buildUrl(this.gatewayApiUrl, `/sse/flights/${encodeURIComponent(channel.flightId)}`);
      case 'dashboard':
        return buildUrl(this.gatewayApiUrl, `/sse/dashboard/${encodeURIComponent(channel.flightId)}`);
      case 'reservation':
        return null;
    }
  }

  private open(channel: RealtimeChannel): void {
    const key = channelKey(channel);
    const url = this.urlFor(channel);
    if (this.streams.has(key) || !url) return;

    const events: Record<string, (data: unknown) => void> = {};
    for (const name of ALL_SERVER_EVENTS) events[name] = (data) => this.registry.dispatch(name, data, channel);

    let reconnecting = false;
    const close = listenSse({
      url,
      factory: this.factory,
      events,
      onOpen: () => {
        this.openStreams.add(key);
        this.refreshState();
        if (reconnecting) this.registry.resync();
        reconnecting = false;
      },
      onError: () => {
        reconnecting = true;
        this.openStreams.delete(key);
        this.refreshState();
      },
    });
    this.streams.set(key, close);
  }

  private close(channel: RealtimeChannel): void {
    const key = channelKey(channel);
    this.streams.get(key)?.();
    this.streams.delete(key);
    this.openStreams.delete(key);
    if (this.active) this.refreshState();
  }

  /** "Conectado" solo si TODOS los streams abiertos están activos (uno fallando = reconectando). */
  private refreshState(): void {
    this.registry.setState(this.openStreams.size >= this.streams.size ? 'connected' : 'reconnecting');
  }
}
