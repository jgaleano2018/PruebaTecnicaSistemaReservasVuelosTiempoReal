import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@reservas-vuelos/shared';
import type {
  ConnectionState,
  RealtimeChannel,
  RealtimeClient,
  RealtimeHandlers,
  Unsubscribe,
} from '@/application/ports';
import { ALL_SERVER_EVENTS, subscriptionMessages } from './channel-matching';
import { ListenerRegistry } from './listener-registry';

type GatewaySocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketFactory = (url: string, token: string | null) => GatewaySocket;

const defaultFactory: SocketFactory = (url, token) =>
  io(url, {
    transports: ['websocket', 'polling'],
    auth: token ? { token } : {},
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    autoConnect: true,
  });

/**
 * Adaptador WebSocket (Socket.io) contra el Realtime Gateway (puerto 4000).
 * Flujo: Módulo de Reservas → Kafka → Realtime Gateway → este cliente.
 * - Una sola conexión por pestaña, con salas por vuelo / lista / dashboard / reserva.
 * - Re-suscribe todas las salas tras una reconexión y pide re-sincronizar con REST
 *   (los eventos emitidos mientras no había conexión no se reenvían).
 */
export class SocketRealtimeClient implements RealtimeClient {
  readonly transport = 'websocket' as const;
  private socket: GatewaySocket | null = null;
  private token: string | null = null;
  private hasConnectedBefore = false;
  private readonly registry = new ListenerRegistry();

  constructor(
    private readonly url: string,
    private readonly factory: SocketFactory = defaultFactory,
  ) {}

  connect(token: string | null = null): void {
    if (this.socket && this.token === token) return;
    this.teardown();
    this.token = token;
    this.hasConnectedBefore = false;
    this.registry.setState('connecting');

    const socket = this.factory(this.url, token);
    this.socket = socket;

    socket.on('connect', () => {
      for (const channel of this.registry.activeChannels()) this.emitSubscribe(channel);
      this.registry.setState('connected');
      if (this.hasConnectedBefore) this.registry.resync();
      this.hasConnectedBefore = true;
    });
    socket.on('disconnect', (reason) => {
      if (!this.socket) return this.registry.setState('disconnected');
      // Si el servidor cierra la conexión, Socket.io NO reintenta solo: se reconecta explícitamente
      if (reason === 'io server disconnect') socket.connect();
      this.registry.setState('reconnecting');
    });
    socket.on('connect_error', () => {
      // `active = false` => el middleware del gateway rechazó el handshake (p. ej. JWT vencido) y
      // Socket.io no reintentará. Se continúa como invitado: las salas públicas (mapa, lista, dashboard)
      // siguen funcionando y la sesión se renueva al volver a iniciar sesión.
      if (!socket.active && this.token) {
        this.connect(null);
        return;
      }
      this.registry.setState(socket.active ? 'reconnecting' : 'disconnected');
    });

    for (const event of ALL_SERVER_EVENTS) {
      socket.on(event, ((payload: unknown) => this.registry.dispatch(event, payload)) as never);
    }
  }

  disconnect(): void {
    this.teardown();
    this.token = null;
    this.registry.setState('disconnected');
  }

  subscribe(channel: RealtimeChannel, handlers: RealtimeHandlers): Unsubscribe {
    const { entry, first } = this.registry.add(channel, handlers);
    if (first && this.socket?.connected) this.emitSubscribe(channel);
    return () => {
      const last = this.registry.remove(entry);
      if (last && this.socket?.connected) {
        const { unsubscribe, arg } = subscriptionMessages(channel);
        if (unsubscribe) (this.socket.emit as (...a: unknown[]) => void)(unsubscribe, ...(arg !== undefined ? [arg] : []));
      }
    };
  }

  onConnectionChange(listener: (s: ConnectionState) => void): Unsubscribe {
    return this.registry.onConnectionChange(listener);
  }

  onResync(listener: () => void): Unsubscribe {
    return this.registry.onResync(listener);
  }

  private emitSubscribe(channel: RealtimeChannel): void {
    const { subscribe, arg } = subscriptionMessages(channel);
    const ack = (res: { ok: boolean; room: string }) => {
      if (!res?.ok) console.warn(`[realtime] suscripción rechazada: ${res?.room}`);
    };
    (this.socket?.emit as (...a: unknown[]) => void)(subscribe, ...(arg !== undefined ? [arg] : []), ack);
  }

  private teardown(): void {
    if (!this.socket) return;
    const s = this.socket;
    this.socket = null;
    s.removeAllListeners();
    s.disconnect();
  }
}
