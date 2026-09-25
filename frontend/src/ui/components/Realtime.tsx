import type { ConnectionState } from '@/application/ports';
import type { StreamState } from '@/application/hooks/dashboard.hooks';
import { useConnectionState } from '@/application/realtime/use-realtime';
import { useServices } from '@/application/services-context';
import { cx } from './primitives';

const LABELS: Record<ConnectionState, string> = {
  connected: 'En vivo',
  connecting: 'Conectando…',
  reconnecting: 'Reconectando…',
  disconnected: 'Sin conexión',
};

/** Estado de la conexión con el Realtime Gateway (WebSocket/SSE). */
export function ConnectionIndicator({ compact = false }: { compact?: boolean }) {
  const state = useConnectionState();
  const { realtime } = useServices();
  const transport = realtime.transport === 'websocket' ? 'WebSocket' : 'SSE';
  return (
    <span
      className={cx('conn', `conn--${state}`)}
      role="status"
      aria-live="polite"
      title={`Tiempo real vía ${transport} (Realtime Gateway): ${LABELS[state]}`}
    >
      <span className="conn__dot" aria-hidden="true" />
      <span className={cx(compact && 'visually-hidden')}>{LABELS[state]}</span>
      {!compact && <span className="conn__transport">{transport}</span>}
    </span>
  );
}

export function LiveBadge({ label = 'Actualización en tiempo real' }: { label?: string }) {
  return (
    <span className="live-badge">
      <span className="live-badge__pulse" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Estado de un stream SSE (Flight Management Service). */
export function StreamBadge({ state, label = 'SSE' }: { state: StreamState; label?: string }) {
  const text = state === 'open' ? 'Stream activo' : state === 'connecting' ? 'Conectando stream…' : 'Stream reconectando…';
  return (
    <span className={cx('conn', state === 'open' ? 'conn--connected' : 'conn--reconnecting')} role="status">
      <span className="conn__dot" aria-hidden="true" />
      {text}
      <span className="conn__transport">{label}</span>
    </span>
  );
}

