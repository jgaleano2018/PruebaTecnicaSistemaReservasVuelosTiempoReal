import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FlightOccupancyDto,
  FlightStatusChangedPayload,
  UpdateFlightStatusRequestDto,
} from '@reservas-vuelos/shared';
import { applyStatusToOccupancy, upsertOccupancy } from '@/domain/occupancy';
import type { RealtimeEventName } from '../ports';
import { queryKeys } from '../query-keys';
import { useRealtimeChannel } from '../realtime/use-realtime';
import { useServices } from '../services-context';

export type StreamState = 'connecting' | 'open' | 'error';

/** Ejecuta `fn` como máximo una vez cada `ms` (agrupa ráfagas de eventos). */
function useThrottled(fn: () => void, ms: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, ms);
  };
}

/**
 * HU4 · Dashboard global: métricas agregadas y ocupación por vuelo (Flight Management Service).
 * - Ocupación por vuelo en vivo: SSE `GET /dashboard/stream` del FMS (proyección de SeatLocked/Released/Confirmed).
 * - Cambios de estado de vuelos: WebSocket del Realtime Gateway (sala `dashboard:all`).
 * - Las métricas agregadas se recalculan en el servidor, agrupando ráfagas de eventos (1 s).
 */
export function useLiveDashboard(date: string, hoursAhead = 72) {
  const { flightManagement } = useServices();
  const queryClient = useQueryClient();
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);

  const overview = useQuery({
    queryKey: queryKeys.dashboardOverview(hoursAhead),
    queryFn: () => flightManagement.overview(hoursAhead),
  });
  const flights = useQuery({
    queryKey: queryKeys.dashboardFlights(date),
    queryFn: () => flightManagement.flightsOccupancy(date),
  });

  const refreshOverview = useThrottled(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardOverview(hoursAhead) }),
    1000,
  );

  const onOccupancy = (occ: FlightOccupancyDto) => {
    queryClient.setQueryData<FlightOccupancyDto[]>(queryKeys.dashboardFlights(date), (list) => (list ? upsertOccupancy(list, occ) : list));
    queryClient.setQueryData<FlightOccupancyDto>(queryKeys.occupancy(occ.flightId), occ);
    setLastEventAt(new Date().toISOString());
    setEventCount((n) => n + 1);
    refreshOverview();
  };
  const onOccupancyRef = useRef(onOccupancy);
  onOccupancyRef.current = onOccupancy;

  useEffect(() => {
    setStreamState('connecting');
    return flightManagement.streamOccupancy(undefined, {
      onOpen: () => setStreamState('open'),
      onError: () => setStreamState('error'),
      onOccupancy: (o) => onOccupancyRef.current(o),
    });
  }, [flightManagement]);

  // La sala de la lista de vuelos ya trae los cambios de estado; `dashboard:all` recibiría además
  // cada evento de asiento de todos los vuelos, que aquí llegan por el SSE del FMS.
  useRealtimeChannel({ kind: 'flights' }, {
    'flight:status-changed': (change) => {
      queryClient.setQueryData<FlightOccupancyDto[]>(queryKeys.dashboardFlights(date), (list) =>
        list ? applyStatusToOccupancy(list, change) : list,
      );
      refreshOverview();
    },
  });

  return { overview, flights, streamState, lastEventAt, eventCount };
}

export interface LiveEvent {
  id: string;
  at: string;
  event: RealtimeEventName;
  title: string;
  detail?: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const MAX_EVENTS = 40;

/**
 * HU4 · Monitor de un vuelo: el dashboard reacciona al instante a cada bloqueo,
 * liberación por expiración y reserva confirmada.
 * - Ocupación: SSE del FMS `GET /dashboard/flights/:id/stream` (snapshot + cada cambio).
 * - Bitácora de eventos: WebSocket del gateway (sala `dashboard:{id}`).
 */
export function useFlightMonitor(flightId: string | undefined) {
  const { flightManagement, analytics } = useServices();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [streamState, setStreamState] = useState<StreamState>('connecting');

  const occupancy = useQuery({
    queryKey: queryKeys.occupancy(flightId ?? ''),
    queryFn: () => flightManagement.occupancy(flightId!),
    enabled: !!flightId,
  });
  const metrics = useQuery({
    queryKey: queryKeys.flightMetrics(flightId ?? ''),
    queryFn: () => analytics.flightMetrics(flightId!),
    enabled: !!flightId,
  });
  const history = useQuery({
    queryKey: queryKeys.statusHistory(flightId ?? ''),
    queryFn: () => flightManagement.statusHistory(flightId!),
    enabled: !!flightId,
  });

  const refreshMetrics = useThrottled(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.flightMetrics(flightId ?? '') }),
    1500,
  );

  useEffect(() => {
    if (!flightId) return;
    setStreamState('connecting');
    const set = (o: FlightOccupancyDto) => queryClient.setQueryData(queryKeys.occupancy(flightId), o);
    return flightManagement.streamOccupancy(flightId, {
      onOpen: () => setStreamState('open'),
      onError: () => setStreamState('error'),
      onSnapshot: set,
      onOccupancy: set,
    });
  }, [flightId, flightManagement, queryClient]);

  const push = (e: Omit<LiveEvent, 'id' | 'at'>) => {
    setEvents((list) =>
      [{ ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString() }, ...list].slice(0, MAX_EVENTS),
    );
    refreshMetrics();
  };

  useRealtimeChannel(flightId ? { kind: 'dashboard', flightId } : null, {
    'seat:locked': (p) =>
      push({ event: 'seat:locked', title: `Asiento ${p.seatNumber} bloqueado`, detail: `Expira ${new Date(p.expiresAt).toLocaleTimeString('es-CO')}`, tone: 'warning' }),
    'seat:released': (p) =>
      push({ event: 'seat:released', title: `Asiento ${p.seatNumber} liberado`, detail: p.reason === 'EXPIRED' ? 'Tiempo de bloqueo expirado' : p.reason, tone: 'info' }),
    'seat:occupied': (p) =>
      push({ event: 'seat:occupied', title: `Asiento ${p.seatNumber} vendido`, detail: `Reserva ${p.reservationCode}`, tone: 'success' }),
    'flight:status-changed': (p: FlightStatusChangedPayload) => {
      push({ event: 'flight:status-changed', title: `Estado: ${p.previousStatus} → ${p.newStatus}`, detail: p.reason, tone: 'danger' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.statusHistory(p.flightId) });
    },
  });

  return { occupancy, metrics, history, events, streamState };
}

export function useChangeFlightStatus() {
  const { flightManagement } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flightId, input }: { flightId: string; input: UpdateFlightStatusRequestDto }) =>
      flightManagement.changeStatus(flightId, input),
    onSuccess: (_d, { flightId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.statusHistory(flightId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.managedFlightsAll });
    },
  });
}
