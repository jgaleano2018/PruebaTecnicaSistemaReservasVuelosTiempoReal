import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CabinClass, flightSearchQuerySchema, type FlightSearchQueryDto } from '@reservas-vuelos/shared';
import { useAirports, useFlightSearch, useRoutes } from '@/application/hooks/flights.hooks';
import { sortFlights, type FlightSort } from '@/domain/flights';
import { formatDate, toIsoDate } from '@/domain/format';
import { cabinLabel, flightStatusLabel } from '@/domain/labels';
import { useRealtimeChannel } from '@/application/realtime/use-realtime';
import { useToast } from '../components/Toast';
import { zodFieldErrors } from '../forms';
import { FlightCard } from '../components/FlightCard';
import { FlowStepper } from '../components/FlowStepper';
import { PlaneIcon, SearchIcon, SwapIcon } from '../components/icons';
import { LiveBadge } from '../components/Realtime';
import { Button, EmptyState, ErrorState, LoadingBlock, SelectField, TextField } from '../components/primitives';

interface FormValues {
  origin: string;
  destination: string;
  date: string;
  cabinClass: string;
  maxPrice: string;
}

function queryFromParams(params: URLSearchParams): FlightSearchQueryDto | null {
  const parsed = flightSearchQuerySchema.safeParse({
    origin: params.get('origin') ?? '',
    destination: params.get('destination') ?? '',
    date: params.get('date') ?? '',
    cabinClass: params.get('cabinClass') || undefined,
    maxPrice: params.get('maxPrice') || undefined,
  });
  return parsed.success ? parsed.data : null;
}

/** Paso 1 del flujo · HU1: búsqueda y filtro de vuelos con actualización de estados en tiempo real. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => queryFromParams(params), [params]);
  const today = toIsoDate(new Date());

  const [values, setValues] = useState<FormValues>(() => ({
    origin: query?.origin ?? 'BOG',
    destination: query?.destination ?? 'MDE',
    date: query?.date ?? today,
    cabinClass: query?.cabinClass ?? '',
    maxPrice: query?.maxPrice ? String(query.maxPrice) : '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<FlightSort>('departure');

  const airports = useAirports();
  const routes = useRoutes();
  const search = useFlightSearch(query);

  const airportOptions = useMemo(
    () => (airports.data ?? []).map((a) => ({ value: a.code, label: `${a.city} (${a.code})` })).sort((a, b) => a.label.localeCompare(b.label)),
    [airports.data],
  );
  const destinationOptions = useMemo(() => {
    if (!routes.data?.length) return airportOptions.filter((a) => a.value !== values.origin);
    const reachable = new Set(routes.data.filter((r) => r.origin === values.origin).map((r) => r.destination));
    const filtered = airportOptions.filter((a) => reachable.has(a.value));
    return filtered.length ? filtered : airportOptions.filter((a) => a.value !== values.origin);
  }, [routes.data, airportOptions, values.origin]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = flightSearchQuerySchema.safeParse({
      ...values,
      cabinClass: values.cabinClass || undefined,
      maxPrice: values.maxPrice || undefined,
    });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    if (parsed.data.origin === parsed.data.destination) return setErrors({ destination: 'El destino debe ser distinto del origen' });
    setErrors({});
    const next = new URLSearchParams({ origin: parsed.data.origin, destination: parsed.data.destination, date: parsed.data.date });
    if (parsed.data.cabinClass) next.set('cabinClass', parsed.data.cabinClass);
    if (parsed.data.maxPrice) next.set('maxPrice', String(parsed.data.maxPrice));
    setParams(next);
  };

  // Aviso visible y anunciado cuando cambia el estado de un vuelo de los resultados
  const toast = useToast();
  useRealtimeChannel(query ? { kind: 'flights' } : null, {
    'flight:status-changed': (c) => {
      if (!search.data?.some((f) => f.id === c.flightId)) return;
      const st = flightStatusLabel[c.newStatus];
      toast.notify({
        tone: st.tone === 'danger' ? 'danger' : st.tone === 'warning' ? 'warning' : 'info',
        title: `Vuelo ${c.flightNumber}: ${st.label}`,
        message: c.delayMinutes ? `Retraso de ${c.delayMinutes} minutos${c.reason ? ` · ${c.reason}` : ''}` : c.reason,
      });
    },
  });

  const swap = () => setValues((v) => ({ ...v, origin: v.destination, destination: v.origin }));
  const results = useMemo(() => (search.data ? sortFlights(search.data, sort) : []), [search.data, sort]);

  return (
    <>
      <section className="hero">
        <div className="container">
          <FlowStepper current={1} />
          <h1 className="hero__title">¿A dónde vuela hoy?</h1>
          <p className="hero__subtitle">Busque vuelos, elija su asiento en un mapa que se actualiza en tiempo real y reciba su boleto al instante.</p>

          <form className="search-form" onSubmit={submit} noValidate aria-label="Buscar vuelos">
            <SelectField
              label="Origen"
              required
              value={values.origin}
              error={errors.origin}
              options={airportOptions}
              placeholder={airports.isLoading ? 'Cargando…' : 'Seleccione'}
              onChange={(e) => setValues({ ...values, origin: e.target.value })}
              containerClassName="search-form__origin"
            />
            <button type="button" className="icon-btn search-form__swap" onClick={swap} aria-label="Intercambiar origen y destino">
              <SwapIcon size={18} />
            </button>
            <SelectField
              label="Destino"
              required
              value={values.destination}
              error={errors.destination}
              options={destinationOptions}
              placeholder="Seleccione"
              onChange={(e) => setValues({ ...values, destination: e.target.value })}
              containerClassName="search-form__destination"
            />
            <TextField
              label="Fecha"
              type="date"
              required
              min={today}
              value={values.date}
              error={errors.date}
              onChange={(e) => setValues({ ...values, date: e.target.value })}
              containerClassName="search-form__date"
            />
            <SelectField
              label="Cabina"
              value={values.cabinClass}
              options={Object.values(CabinClass).map((c) => ({ value: c, label: cabinLabel[c] }))}
              placeholder="Todas"
              onChange={(e) => setValues({ ...values, cabinClass: e.target.value })}
              containerClassName="search-form__cabin"
            />
            <TextField
              label="Precio máximo (COP)"
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
              value={values.maxPrice}
              error={errors.maxPrice}
              onChange={(e) => setValues({ ...values, maxPrice: e.target.value })}
              containerClassName="search-form__price"
            />
            <Button type="submit" size="lg" icon={<SearchIcon size={18} />} className="search-form__submit" loading={search.isFetching && !search.data}>
              Buscar
            </Button>
          </form>
          {airports.isError && <ErrorState error={airports.error} onRetry={() => airports.refetch()} title="No se pudo cargar el catálogo de aeropuertos" />}
        </div>
      </section>

      <section className="container page" aria-labelledby="results-title">
        {!query && (
          <EmptyState title="Empiece por buscar un vuelo" icon={<PlaneIcon size={28} />}>
            Seleccione origen, destino y fecha. Los resultados se actualizan solos si un vuelo se retrasa, se cancela o se agota.
          </EmptyState>
        )}

        {query && (
          <>
            <div className="results-head">
              <div>
                <h2 id="results-title" className="section-title">
                  {query.origin} → {query.destination}
                </h2>
                <p className="muted">
                  {formatDate(`${query.date}T12:00:00`)}
                  {search.data && ` · ${search.data.length} ${search.data.length === 1 ? 'vuelo' : 'vuelos'}`}
                </p>
              </div>
              <div className="results-head__tools">
                <LiveBadge />
                <SelectField
                  label="Ordenar por"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as FlightSort)}
                  options={[
                    { value: 'departure', label: 'Hora de salida' },
                    { value: 'price', label: 'Precio' },
                    { value: 'duration', label: 'Duración' },
                  ]}
                  containerClassName="field--inline"
                />
              </div>
            </div>

            {search.isLoading && <LoadingBlock label="Buscando vuelos…" rows={4} />}
            {search.isError && <ErrorState error={search.error} onRetry={() => search.refetch()} />}
            {search.isSuccess && results.length === 0 && (
              <EmptyState title="No hay vuelos para esta búsqueda" icon={<SearchIcon size={28} />}>
                Pruebe otra fecha u otra ruta (hay datos de prueba para los próximos 10 días).
              </EmptyState>
            )}
            <ul className="results-list" aria-busy={search.isFetching}>
              {results.map((f) => (
                <li key={f.id}>
                  <FlightCard flight={f} cabin={query.cabinClass} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
