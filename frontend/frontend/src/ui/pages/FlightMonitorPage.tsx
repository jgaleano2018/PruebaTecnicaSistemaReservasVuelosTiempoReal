import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FlightStatus, UserRole, updateFlightStatusSchema } from '@reservas-vuelos/shared';
import { useAuth } from '@/application/auth/auth-context';
import { useServices } from '@/application/services-context';
import { useChangeFlightStatus, useFlightMonitor } from '@/application/hooks/dashboard.hooks';
import { useLiveSeatMap } from '@/application/hooks/seats.hooks';
import { toUserMessage } from '@/domain/errors';
import { ALLOWED_STATUS_TRANSITIONS } from '@/domain/flights';
import { formatDate, formatDateTime, formatMoney, formatPercent, formatTime } from '@/domain/format';
import { flightStatusLabel } from '@/domain/labels';
import { zodFieldErrors } from '../forms';
import { BoltIcon, LockIcon, SeatIcon, TicketIcon } from '../components/icons';
import { KpiTile, OccupancyBar } from '../components/Occupancy';
import { LiveBadge, StreamBadge } from '../components/Realtime';
import { SeatLegend, SeatMap } from '../components/SeatMap';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ErrorState, LoadingBlock, PageHeader, SelectField, TextField } from '../components/primitives';

function StatusChangeForm({ flightId, current }: { flightId: string; current: FlightStatus }) {
  const change = useChangeFlightStatus();
  const toast = useToast();
  const options = ALLOWED_STATUS_TRANSITIONS[current] ?? [];
  const [status, setStatus] = useState<string>(options[0] ?? '');
  const [delay, setDelay] = useState('30');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!options.length) return <p className="muted small">El vuelo está en un estado final ({flightStatusLabel[current].label}).</p>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = updateFlightStatusSchema.safeParse({
      status,
      delayMinutes: status === FlightStatus.DELAYED ? delay : undefined,
      reason: reason || undefined,
    });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});
    try {
      await change.mutateAsync({ flightId, input: parsed.data });
      toast.notify({ tone: 'success', title: 'Estado actualizado', message: 'Se emitió FlightStatusChanged a todos los clientes conectados.' });
      setReason('');
    } catch (err) {
      toast.notify({ tone: 'danger', title: 'No se pudo cambiar el estado', message: toUserMessage(err) });
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <SelectField
        label="Nuevo estado"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        options={options.map((s) => ({ value: s, label: flightStatusLabel[s].label }))}
      />
      {status === FlightStatus.DELAYED && (
        <TextField label="Minutos de retraso" type="number" min={1} max={1440} value={delay} error={errors.delayMinutes} onChange={(e) => setDelay(e.target.value)} />
      )}
      <TextField label="Motivo" value={reason} error={errors.reason} placeholder="Opcional" onChange={(e) => setReason(e.target.value)} />
      <Button type="submit" variant={status === FlightStatus.CANCELLED ? 'danger' : 'primary'} loading={change.isPending}>
        Aplicar cambio
      </Button>
    </form>
  );
}

/** HU4 · Vista de estado de un vuelo: métricas, mapa y bitácora de eventos en tiempo real. */
export function FlightMonitorPage() {
  const transportLabel = useServices().realtime.transport === 'sse' ? 'SSE' : 'WebSocket';
  const { flightId } = useParams<{ flightId: string }>();
  const { user } = useAuth();
  const { occupancy, metrics, history, events, streamState } = useFlightMonitor(flightId);
  const seats = useLiveSeatMap(flightId, 'dashboard');

  if (occupancy.isLoading) {
    return (
      <div className="container page">
        <LoadingBlock rows={6} />
      </div>
    );
  }
  if (occupancy.isError || !occupancy.data) {
    return (
      <div className="container page">
        <ErrorState error={occupancy.error} onRetry={() => occupancy.refetch()} />
      </div>
    );
  }

  const o = occupancy.data;
  const st = flightStatusLabel[o.status];
  const m = metrics.data;

  return (
    <div className="container page">
      <PageHeader
        eyebrow={`Monitor del vuelo · ${formatDate(o.departureTime)} ${formatTime(o.departureTime)}`}
        title={`${o.flightNumber} · ${o.origin} → ${o.destination}`}
        actions={
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            <StreamBadge state={streamState} />
          </>
        }
      />

      <div className="kpi-grid">
        <KpiTile label="Disponibles" value={o.available} tone="available" icon={<SeatIcon size={18} />} />
        <KpiTile label="Bloqueados" value={o.locked} tone="locked" icon={<LockIcon size={18} />} hint="Pagos en curso" />
        <KpiTile label="Ocupados" value={o.occupied} tone="occupied" icon={<TicketIcon size={18} />} />
        <KpiTile label="Ocupación" value={formatPercent(o.occupancyRate)} tone="brand" icon={<BoltIcon size={18} />} hint={`${o.total} asientos`} />
      </div>

      <Card>
        <OccupancyBar counts={o} label={`Vuelo ${o.flightNumber}`} />
        <p className="muted small live-meta">Actualizado {new Date(o.updatedAt).toLocaleTimeString('es-CO')}</p>
      </Card>

      <div className="monitor">
        <Card className="monitor__map">
          <div className="seat-layout__map-head">
            <h2 className="section-title">Mapa en vivo</h2>
            <SeatLegend />
          </div>
          {seats.data ? <SeatMap map={seats.data} readOnly /> : seats.isError ? <ErrorState error={seats.error} /> : <LoadingBlock rows={4} />}
          {user?.role !== UserRole.SPECTATOR && (
            <p className="muted small">
              ¿Quiere reservar? <Link to={`/flights/${o.flightId}`}>Ir a la selección de asientos</Link>
            </p>
          )}
        </Card>

        <div className="monitor__side">
          <Card>
            <div className="card__head">
              <h2 className="section-title">Eventos en tiempo real</h2>
              <LiveBadge label={transportLabel} />
            </div>
            {events.length === 0 ? (
              <p className="muted small">Esperando eventos… Abra otra pestaña y bloquee un asiento de este vuelo para verlo aparecer aquí al instante.</p>
            ) : (
              <ol className="event-log" aria-live="polite" aria-label="Bitácora de eventos del vuelo">
                {events.map((e) => (
                  <li key={e.id} className={`event-log__item event-log__item--${e.tone}`}>
                    <div>
                      <p className="event-log__title">{e.title}</p>
                      {e.detail && <p className="event-log__detail">{e.detail}</p>}
                    </div>
                    <time dateTime={e.at} className="event-log__time">
                      {new Date(e.at).toLocaleTimeString('es-CO')}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <h2 className="section-title">Conversión e ingresos</h2>
            {metrics.isLoading && <LoadingBlock rows={2} />}
            {metrics.isError && <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />}
            {m && (
              <dl className="summary-list">
                <div>
                  <dt>Reservas confirmadas</dt>
                  <dd className="tabular">{m.confirmedReservations}</dd>
                </div>
                <div>
                  <dt>Bloqueos pendientes</dt>
                  <dd className="tabular">{m.pendingHolds}</dd>
                </div>
                <div>
                  <dt>Bloqueos expirados</dt>
                  <dd className="tabular">{m.expiredHolds}</dd>
                </div>
                <div>
                  <dt>Conversión (bloqueo → compra)</dt>
                  <dd className="tabular">{formatPercent(m.conversionRate)}</dd>
                </div>
                <div className="summary-list__total">
                  <dt>Ingresos</dt>
                  <dd className="tabular">{formatMoney(m.revenue, m.currency)}</dd>
                </div>
              </dl>
            )}
          </Card>

          {user?.role === UserRole.ADMIN && flightId && (
            <Card>
              <h2 className="section-title">Cambiar estado del vuelo</h2>
              <StatusChangeForm flightId={flightId} current={o.status} />
            </Card>
          )}

          <Card>
            <h2 className="section-title">Historial de estados</h2>
            {history.data?.length ? (
              <ol className="timeline">
                {history.data.map((h, i) => (
                  <li key={`${h.changedAt}-${i}`}>
                    <p>
                      <strong>{flightStatusLabel[h.previousStatus]?.label ?? h.previousStatus}</strong> → <strong>{flightStatusLabel[h.newStatus]?.label ?? h.newStatus}</strong>
                      {h.delayMinutes ? ` (${h.delayMinutes} min)` : ''}
                    </p>
                    <p className="muted small">
                      {formatDateTime(h.changedAt)} · {h.changedBy}
                      {h.reason && ` · ${h.reason}`}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">Sin cambios de estado registrados.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
