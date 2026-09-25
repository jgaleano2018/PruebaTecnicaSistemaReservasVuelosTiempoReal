import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlightStatus, type FlightOccupancyDto } from '@reservas-vuelos/shared';
import { useLiveDashboard } from '@/application/hooks/dashboard.hooks';
import { StreamBadge } from '../components/Realtime';
import { formatPercent, formatTime, toIsoDate } from '@/domain/format';
import { flightStatusLabel } from '@/domain/labels';
import { totalsOf } from '@/domain/occupancy';
import { BoltIcon, ChartIcon, LockIcon, SeatIcon } from '../components/icons';
import { KpiTile, OccupancyBar } from '../components/Occupancy';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SelectField, TextField, cx } from '../components/primitives';

type SortKey = 'departure' | 'occupancy' | 'locked';

/** Paso 5 del flujo · HU4: dashboard de ocupación en tiempo real (administrador / espectador). */
export function DashboardPage() {
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [sort, setSort] = useState<SortKey>('departure');
  const { overview, flights, streamState, lastEventAt, eventCount } = useLiveDashboard(date);

  const rows = useMemo(() => {
    const list = [...(flights.data ?? [])];
    if (sort === 'occupancy') return list.sort((a, b) => b.occupancyRate - a.occupancyRate);
    if (sort === 'locked') return list.sort((a, b) => b.locked - a.locked);
    return list.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }, [flights.data, sort]);

  const dayTotals = useMemo(() => totalsOf(flights.data ?? []), [flights.data]);
  const o = overview.data;

  return (
    <div className="container page">
      <PageHeader
        eyebrow="Flight Management Service · Realtime Gateway"
        title="Dashboard de ocupación en vivo"
        description="Reacciona al instante a cada bloqueo, liberación por tiempo expirado y reserva confirmada."
        actions={<StreamBadge state={streamState} />}
      />

      {overview.isError && <ErrorState error={overview.error} onRetry={() => overview.refetch()} title="No se pudo cargar el resumen del Flight Management Service" />}

      <section aria-labelledby="kpi-title" className="stack">
        <h2 id="kpi-title" className="visually-hidden">
          Métricas agregadas (próximas 72 horas)
        </h2>
        {overview.isLoading ? (
          <LoadingBlock rows={2} />
        ) : (
          o && (
            <>
              <div className="kpi-grid">
                <KpiTile label="Vuelos (72 h)" value={o.totalFlights.toLocaleString('es-CO')} icon={<ChartIcon size={18} />} tone="brand" />
                <KpiTile label="Disponibles" value={o.available.toLocaleString('es-CO')} icon={<SeatIcon size={18} />} tone="available" />
                <KpiTile label="Bloqueados ahora" value={o.locked.toLocaleString('es-CO')} icon={<LockIcon size={18} />} tone="locked" hint="Asientos en proceso de compra" />
                <KpiTile label="Ocupados" value={o.occupied.toLocaleString('es-CO')} icon={<BoltIcon size={18} />} tone="occupied" hint={`${formatPercent(o.occupancyRate)} de ocupación`} />
              </div>
              <Card>
                <div className="card__head">
                  <h3 className="section-title">Ocupación total · {o.totalSeats.toLocaleString('es-CO')} asientos</h3>
                  <div className="chips" aria-label="Vuelos por estado">
                    {Object.entries(o.flightsByStatus).map(([status, count]) => (
                      <Badge key={status} tone={flightStatusLabel[status as FlightStatus]?.tone ?? 'neutral'}>
                        {flightStatusLabel[status as FlightStatus]?.label ?? status}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
                <OccupancyBar counts={{ total: o.totalSeats, available: o.available, locked: o.locked, occupied: o.occupied }} label="Todos los vuelos" />
                <p className="muted small live-meta">
                  {eventCount} actualizaciones recibidas{lastEventAt && ` · última a las ${new Date(lastEventAt).toLocaleTimeString('es-CO')}`}
                </p>
              </Card>
            </>
          )
        )}
      </section>

      <section aria-labelledby="flights-title" className="stack">
        <div className="results-head">
          <div>
            <h2 id="flights-title" className="section-title">
              Ocupación por vuelo
            </h2>
            {flights.data && (
              <p className="muted small">
                {flights.data.length} vuelos · {dayTotals.occupied} ocupados · {dayTotals.locked} bloqueados · {formatPercent(dayTotals.occupancyRate)}
              </p>
            )}
          </div>
          <div className="results-head__tools">
            <TextField label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} containerClassName="field--inline" />
            <SelectField
              label="Ordenar"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              options={[
                { value: 'departure', label: 'Salida' },
                { value: 'occupancy', label: '% ocupación' },
                { value: 'locked', label: 'Bloqueos activos' },
              ]}
              containerClassName="field--inline"
            />
          </div>
        </div>

        {flights.isLoading && <LoadingBlock rows={5} />}
        {flights.isError && <ErrorState error={flights.error} onRetry={() => flights.refetch()} />}
        {flights.isSuccess && rows.length === 0 && <EmptyState title="No hay vuelos para esta fecha" />}
        {rows.length > 0 && <OccupancyTable rows={rows} />}
      </section>
    </div>
  );
}

function OccupancyTable({ rows }: { rows: FlightOccupancyDto[] }) {
  return (
    <div className="table-wrap">
      <table className="table table--dashboard">
        <caption className="visually-hidden">Ocupación en tiempo real por vuelo</caption>
        <thead>
          <tr>
            <th scope="col">Vuelo</th>
            <th scope="col">Ruta</th>
            <th scope="col">Salida</th>
            <th scope="col">Estado</th>
            <th scope="col" className="col-bar">
              Ocupación
            </th>
            <th scope="col" className="num">
              Disp.
            </th>
            <th scope="col" className="num">
              Bloq.
            </th>
            <th scope="col" className="num">
              Ocup.
            </th>
            <th scope="col" className="num">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = flightStatusLabel[r.status];
            return (
              <tr key={r.flightId}>
                <th scope="row">
                  <Link to={`/dashboard/flights/${r.flightId}`}>{r.flightNumber}</Link>
                </th>
                <td>
                  {r.origin} → {r.destination}
                </td>
                <td>{formatTime(r.departureTime)}</td>
                <td>
                  <Badge tone={st?.tone ?? 'neutral'}>{st?.label ?? r.status}</Badge>
                </td>
                <td className="col-bar">
                  <OccupancyBar counts={r} showLegend={false} size="sm" label={`Vuelo ${r.flightNumber}`} />
                </td>
                <td className="num tabular">{r.available}</td>
                <td className={cx('num tabular', r.locked > 0 && 'text-locked')}>{r.locked}</td>
                <td className="num tabular">{r.occupied}</td>
                <td className="num tabular">{formatPercent(r.occupancyRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
