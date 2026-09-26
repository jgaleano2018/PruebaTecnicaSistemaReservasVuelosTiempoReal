import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlightDto, FlightSearchQueryDto } from '@reservas-vuelos/shared';
import { applyFlightStatusChange, applyOccupancyToFlights } from '@/domain/flights';
import { queryKeys } from '../query-keys';
import { useRealtimeChannel } from '../realtime/use-realtime';
import { useServices } from '../services-context';

const HOUR = 60 * 60 * 1000;

export function useAirports() {
  const { flights } = useServices();
  return useQuery({ queryKey: queryKeys.airports, queryFn: () => flights.airports(), staleTime: HOUR });
}

export function useRoutes() {
  const { flights } = useServices();
  return useQuery({ queryKey: queryKeys.routes, queryFn: () => flights.routes(), staleTime: HOUR });
}

export function useAircraft() {
  const { flights } = useServices();
  return useQuery({ queryKey: queryKeys.aircraft, queryFn: () => flights.aircraft(), staleTime: HOUR });
}

/**
 * HU1: búsqueda de vuelos + regla de tiempo real.
 * Se suscribe a la sala `flights:list` del gateway: los cambios de estado (FlightStatusChanged)
 * y de ocupación (FlightOccupancyUpdated) se aplican sobre la caché sin recargar la página.
 */
export function useFlightSearch(query: FlightSearchQueryDto | null) {
  const { flights } = useServices();
  const queryClient = useQueryClient();

  const result = useQuery({
    queryKey: query ? queryKeys.flightSearch(query) : ['flights', 'search', 'idle'],
    queryFn: () => flights.search(query!),
    enabled: !!query,
    staleTime: 30_000,
    // Al volver a los resultados se re-sincroniza (estados y disponibilidad pudieron cambiar mientras no estaba abierta)
    refetchOnMount: 'always',
  });

  const updateAll = (fn: (list: FlightDto[]) => FlightDto[]) =>
    queryClient.setQueriesData<FlightDto[]>({ queryKey: queryKeys.flightSearchAll }, (old) => (old ? fn(old) : old));

  useRealtimeChannel(query ? { kind: 'flights' } : null, {
    'flight:status-changed': (change) => {
      updateAll((list) => applyFlightStatusChange(list, change));
      queryClient.setQueryData<FlightDto>(queryKeys.flight(change.flightId), (f) =>
        f ? applyFlightStatusChange([f], change)[0] : f,
      );
    },
    'dashboard:occupancy': (occ) => updateAll((list) => applyOccupancyToFlights(list, occ)),
  });

  return result;
}

export function useFlight(flightId: string | undefined) {
  const { flights } = useServices();
  const queryClient = useQueryClient();
  const result = useQuery({
    queryKey: queryKeys.flight(flightId ?? ''),
    queryFn: () => flights.getFlight(flightId!),
    enabled: !!flightId,
  });
  useRealtimeChannel(flightId ? { kind: 'flight', flightId } : null, {
    'flight:status-changed': (change) =>
      queryClient.setQueryData<FlightDto>(queryKeys.flight(change.flightId), (f) =>
        f ? applyFlightStatusChange([f], change)[0] : f,
      ),
  });
  return result;
}
