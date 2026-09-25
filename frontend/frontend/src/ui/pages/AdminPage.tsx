import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FlightStatus, ReservationStatus } from '@reservas-vuelos/shared';
import {
  useCustomerReservations,
  useCustomers,
  useDemandReport,
  useManagedFlights,
  useRealtimeStatus,
  useSummaryReport,
  useSyncActions,
  useSyncLog,
  type ManagedFlightFilter,
} from '@/application/hooks/admin.hooks';
import { useAircraft, useAirports, useRoutes } from '@/application/hooks/flights.hooks';
import { toUserMessage } from '@/domain/errors';
import { formatDateTime, formatDuration, formatMoney, formatTime, toIsoDate } from '@/domain/format';
import { flightStatusLabel, reservationStatusLabel } from '@/domain/labels';
import { KpiTile } from '../components/Occupancy';
import { RefreshIcon } from '../components/icons';
import { Tabs } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SelectField, TextField } from '../components/primitives';

/* ------------------------- Vuelos (FMS) ------------------------- */

function FlightsTab() {
  const [filter, setFilter] = useState<ManagedFlightFilter>({ date: toIsoDate(new Date()) });
  const flights = useManagedFlights(filter);
  const airports = useAirports();
  const airportOptions = (airports.data ?? []).map((a) => ({ value: a.code, label: `${a.code} · ${a.city}` }));

  return (
    <div className="stack">
      <div className="filters">
        <TextField label="Fecha" type="date" value={filter.date ?? ''} onChange={(e) => setFilter({ ...filter, date: e.target.value || undefined })} />
        <SelectField
          label="Estado"
          value={filter.status ?? ''}
          placeholder="Todos"
          options={Object.values(FlightStatus).map((s) => ({ value: s, label: flightStatusLabel[s].label }))}
          onChange={(e) => setFilter({ ...filter, status: (e.target.value || undefined) as FlightStatus | undefined })}
        />
        <SelectField label="Origen" value={filter.origin ?? ''} placeholder="Todos" options={airportOptions} onChange={(e) => setFilter({ ...filter, origin: e.target.value || undefined })} />
        <SelectField label="Destino" value={filter.destination ?? ''} placeholder="Todos" options={airportOptions} onChange={(e) => setFilter({ ...filter, destination: e.target.value || undefined })} />
      </div>
      {flights.isLoading && <LoadingBlock rows={5} />}
      {flights.isError && <ErrorState error={flights.error} onRetry={() => flights.refetch()} />}
      {flights.data?.length === 0 && <EmptyState title="No hay vuelos con estos filtros" />}
      {!!flights.data?.length && (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Vuelos gestionados por el Flight Management Service</caption>
            <thead>
              <tr>
                <th scope="col">Vuelo</th>
                <th scope="col">Ruta</th>
                <th scope="col">Salida</th>
                <th scope="col">Aeronave</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {flights.data.map((f) => {
                const st = flightStatusLabel[f.status];
                return (
                  <tr key={f.id}>
                    <th scope="row">{f.flightNumber}</th>
                    <td>
                      {f.origin} → {f.destination}
                    </td>
                    <td>{formatTime(f.departureTime)}</td>
                    <td>{f.aircraft}</td>
                    <td>
                      <Badge tone={st.tone}>
                        {st.label}
                        {f.delayMinutes ? ` ${f.delayMinutes} min` : ''}
                      </Badge>
                    </td>
                    <td className="actions">
                      <Link className="btn btn--ghost btn--sm" to={`/dashboard/flights/${f.id}`}>
                        <span>Gestionar / monitorear</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Sincronización (FMS) ------------------------- */

function SyncTab() {
  const log = useSyncLog();
  const actions = useSyncActions();
  const toast = useToast();

  const run = async (kind: 'catalog' | 'airlines') => {
    try {
      await actions[kind].mutateAsync();
      toast.notify({ tone: 'success', title: kind === 'catalog' ? 'Catálogo sincronizado desde el monolito' : 'Sincronización con aerolíneas/GDS ejecutada' });
    } catch (err) {
      toast.notify({ tone: 'danger', title: 'Error de sincronización', message: toUserMessage(err) });
    }
  };

  return (
    <div className="stack">
      <div className="button-row">
        <Button icon={<RefreshIcon size={18} />} loading={actions.catalog.isPending} onClick={() => run('catalog')}>
          Re-sincronizar catálogo
        </Button>
        <Button variant="secondary" loading={actions.airlines.isPending} onClick={() => run('airlines')}>
          Sincronizar con aerolíneas / GDS (simulación)
        </Button>
      </div>
      {log.isLoading && <LoadingBlock rows={3} />}
      {log.isError && <ErrorState error={log.error} onRetry={() => log.refetch()} />}
      {log.data?.length === 0 && <EmptyState title="Sin sincronizaciones registradas" />}
      {!!log.data?.length && (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Bitácora de sincronizaciones</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col" className="num">
                  Vuelos
                </th>
                <th scope="col" className="num">
                  Cambios
                </th>
              </tr>
            </thead>
            <tbody>
              {log.data.map((l, i) => (
                <tr key={`${l.at}-${i}`}>
                  <td>{formatDateTime(l.at)}</td>
                  <td>{l.type === 'CATALOG' ? 'Catálogo (monolito)' : 'Aerolíneas / GDS'}</td>
                  <td className="num tabular">{l.flights}</td>
                  <td className="num tabular">{l.changes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Reportes (Analytics) ------------------------- */

function ReportsTab() {
  const summary = useSummaryReport();
  const demand = useDemandReport();
  const s = summary.data;
  const maxRevenue = Math.max(1, ...(demand.data ?? []).map((d) => d.revenue));

  return (
    <div className="stack">
      {summary.isLoading && <LoadingBlock rows={2} />}
      {summary.isError && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}
      {s && (
        <div className="kpi-grid">
          <KpiTile label="Vuelos" value={s.totalFlights.toLocaleString('es-CO')} tone="brand" />
          <KpiTile label="Reservas confirmadas" value={s.confirmedReservations.toLocaleString('es-CO')} tone="occupied" />
          <KpiTile label="Ingresos" value={formatMoney(s.revenue, s.currency)} tone="available" />
          <KpiTile
            label="Bloqueos expirados"
            value={(s.reservationsByStatus[ReservationStatus.EXPIRED] ?? 0).toLocaleString('es-CO')}
            tone="locked"
            hint="Liberados automáticamente"
          />
        </div>
      )}
      <Card>
        <h3 className="section-title">Demanda por ruta (últimos 30 días)</h3>
        {demand.isLoading && <LoadingBlock rows={3} />}
        {demand.isError && <ErrorState error={demand.error} onRetry={() => demand.refetch()} />}
        {demand.data?.length === 0 && <p className="muted small">Aún no hay reservas confirmadas en el periodo.</p>}
        {!!demand.data?.length && (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Demanda e ingresos por ruta</caption>
              <thead>
                <tr>
                  <th scope="col">Ruta</th>
                  <th scope="col" className="num">
                    Reservas
                  </th>
                  <th scope="col" className="col-bar">
                    Ingresos
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...demand.data]
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((d) => (
                    <tr key={d.route}>
                      <th scope="row">{d.route}</th>
                      <td className="num tabular">{d.reservations}</td>
                      <td className="col-bar">
                        <div className="hbar" title={formatMoney(d.revenue, d.currency)}>
                          <span className="hbar__fill" style={{ width: `${(d.revenue / maxRevenue) * 100}%` }} />
                          <span className="hbar__label tabular">{formatMoney(d.revenue, d.currency)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------- Clientes ------------------------- */

function CustomersTab() {
  const customers = useCustomers(100, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const reservations = useCustomerReservations(selected);

  return (
    <div className="split">
      <div>
        {customers.isLoading && <LoadingBlock rows={4} />}
        {customers.isError && <ErrorState error={customers.error} onRetry={() => customers.refetch()} />}
        {customers.data?.length === 0 && <EmptyState title="Sin clientes registrados" />}
        {!!customers.data?.length && (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Clientes</caption>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Contacto</th>
                  <th scope="col" className="num">
                    Reservas
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.data.map((c) => (
                  <tr key={c.id} className={selected === c.id ? 'is-selected' : undefined}>
                    <th scope="row">
                      <button type="button" className="link-btn" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>
                        {c.firstName} {c.lastName}
                      </button>
                    </th>
                    <td>
                      {c.documentType} {c.documentNumber}
                    </td>
                    <td>
                      {c.email}
                      {c.phone && <span className="muted small"> · {c.phone}</span>}
                    </td>
                    <td className="num tabular">{c.reservationsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Card as="aside" aria-label="Historial de reservas del cliente">
        <h3 className="section-title">Historial de reservas</h3>
        {!selected && <p className="muted small">Seleccione un cliente para ver su historial.</p>}
        {reservations.isLoading && <LoadingBlock rows={3} />}
        {reservations.data?.length === 0 && <p className="muted small">Sin reservas.</p>}
        <ul className="plain-list">
          {reservations.data?.map((r) => (
            <li key={r.id}>
              <span className="mono">{r.reservationCode ?? r.id.slice(0, 8)}</span> · asiento {r.seatNumber}{' '}
              <Badge tone={reservationStatusLabel[r.status].tone}>{reservationStatusLabel[r.status].label}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------- Catálogo y sistema ------------------------- */

function CatalogTab() {
  const airports = useAirports();
  const routes = useRoutes();
  const aircraft = useAircraft();
  const status = useRealtimeStatus();

  return (
    <div className="stack">
      <Card>
        <h3 className="section-title">Bus de eventos (Módulo de Tiempo Real)</h3>
        {status.isError && <ErrorState error={status.error} />}
        {status.data && (
          <>
            <p className="muted small">
              {status.data.stats.totalEvents} eventos procesados
              {status.data.stats.lastEventAt && ` · último ${formatDateTime(status.data.stats.lastEventAt)}`}
            </p>
            <div className="chips">
              {Object.entries(status.data.stats.byType).map(([type, n]) => (
                <Badge key={type} tone="info">
                  {type}: {n}
                </Badge>
              ))}
            </div>
            <p className="muted small">Publica: {status.data.publishes.join(', ')}</p>
          </>
        )}
      </Card>
      <div className="grid-3">
        <Card>
          <h3 className="section-title">Aeropuertos ({airports.data?.length ?? 0})</h3>
          <ul className="plain-list small">
            {airports.data?.map((a) => (
              <li key={a.code}>
                <strong>{a.code}</strong> · {a.city}, {a.country}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="section-title">Rutas ({routes.data?.length ?? 0})</h3>
          <ul className="plain-list small scroll-list">
            {routes.data?.map((r) => (
              <li key={r.id}>
                {r.origin} → {r.destination} · {r.distanceKm.toLocaleString('es-CO')} km · {formatDuration(r.durationMinutes)}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="section-title">Flota ({aircraft.data?.length ?? 0})</h3>
          <ul className="plain-list small">
            {aircraft.data?.map((a) => (
              <li key={a.id}>
                <strong>{a.model}</strong> · {a.registration} · {a.totalSeats} asientos
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** Dashboard / Admin (React) del diagrama: gestión de vuelos, sincronización, reportes y clientes. */
export function AdminPage() {
  const [tab, setTab] = useState('flights');
  return (
    <div className="container page">
      <PageHeader
        eyebrow="Administrador"
        title="Administración"
        description="Gestión de vuelos (Flight Management Service), reportes (Analytics) y clientes (monolito)."
        actions={
          <Link className="btn btn--secondary btn--md" to="/dashboard">
            <span>Ver dashboard en vivo</span>
          </Link>
        }
      />
      <Card>
        <Tabs
          label="Secciones de administración"
          active={tab}
          onChange={setTab}
          items={[
            { id: 'flights', label: 'Vuelos' },
            { id: 'sync', label: 'Sincronización' },
            { id: 'reports', label: 'Reportes' },
            { id: 'customers', label: 'Clientes' },
            { id: 'catalog', label: 'Catálogo y sistema' },
          ]}
        >
          {tab === 'flights' && <FlightsTab />}
          {tab === 'sync' && <SyncTab />}
          {tab === 'reports' && <ReportsTab />}
          {tab === 'customers' && <CustomersTab />}
          {tab === 'catalog' && <CatalogTab />}
        </Tabs>
      </Card>
    </div>
  );
}
