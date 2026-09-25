import type {
  ConnectionState,
  RealtimeChannel,
  RealtimeEventName,
  RealtimeHandlers,
  Unsubscribe,
} from '@/application/ports';
import { channelKey, matchesChannel } from './channel-matching';

interface Entry {
  channel: RealtimeChannel;
  handlers: RealtimeHandlers;
}

/**
 * Registro de suscriptores compartido por los adaptadores de tiempo real (Socket.io y SSE):
 * conteo de referencias por canal, despacho filtrado y notificación de estado de conexión (DRY).
 */
export class ListenerRegistry {
  private readonly entries = new Set<Entry>();
  private readonly refCounts = new Map<string, { channel: RealtimeChannel; count: number }>();
  private readonly connectionListeners = new Set<(s: ConnectionState) => void>();
  private readonly resyncListeners = new Set<() => void>();
  private state: ConnectionState = 'disconnected';

  /** Devuelve true si es el primer suscriptor del canal (hay que abrir la sala / stream). */
  add(channel: RealtimeChannel, handlers: RealtimeHandlers): { entry: Entry; first: boolean } {
    const entry = { channel, handlers };
    this.entries.add(entry);
    const key = channelKey(channel);
    const ref = this.refCounts.get(key);
    if (ref) ref.count++;
    else this.refCounts.set(key, { channel, count: 1 });
    return { entry, first: !ref };
  }

  /** Devuelve true si era el último suscriptor del canal (hay que cerrar la sala / stream). */
  remove(entry: Entry): boolean {
    if (!this.entries.delete(entry)) return false;
    const key = channelKey(entry.channel);
    const ref = this.refCounts.get(key);
    if (!ref) return false;
    ref.count--;
    if (ref.count <= 0) {
      this.refCounts.delete(key);
      return true;
    }
    return false;
  }

  activeChannels(): RealtimeChannel[] {
    return [...this.refCounts.values()].map((r) => r.channel);
  }

  dispatch(event: RealtimeEventName, payload: unknown, only?: RealtimeChannel): void {
    for (const { channel, handlers } of this.entries) {
      if (only && channelKey(only) !== channelKey(channel)) continue;
      const handler = handlers[event] as ((p: unknown) => void) | undefined;
      if (handler && matchesChannel(channel, event, payload)) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[realtime] error en el manejador de ${event}`, err);
        }
      }
    }
  }

  setState(state: ConnectionState): void {
    if (state === this.state) return;
    this.state = state;
    for (const l of this.connectionListeners) l(state);
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  onConnectionChange(listener: (s: ConnectionState) => void): Unsubscribe {
    this.connectionListeners.add(listener);
    listener(this.state);
    return () => this.connectionListeners.delete(listener);
  }

  onResync(listener: () => void): Unsubscribe {
    this.resyncListeners.add(listener);
    return () => this.resyncListeners.delete(listener);
  }

  resync(): void {
    for (const l of this.resyncListeners) l();
  }
}
