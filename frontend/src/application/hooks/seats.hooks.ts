import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SeatMapDto } from '@reservas-vuelos/shared';
import { applySeatEvent, replaceSeat, type SeatEvent } from '@/domain/seat-map';
import { useAuth } from '../auth/auth-context';
import { queryKeys } from '../query-keys';
import { useRealtimeChannel } from '../realtime/use-realtime';
import { useServices } from '../services-context';

export interface SeatActivity {
  id: string;
  at: string;
  seatNumber: string;
  kind: 'locked' | 'released' | 'occupied';
  mine: boolean;
}

const MAX_ACTIVITY = 25;

/**
 * HU2/HU3: mapa interactivo de asientos sincronizado en tiempo real.
 * Estado inicial por REST (monolito) y luego eventos de la sala `flight:{id}`:
 *   seat:locked (SeatLocked) · seat:released (SeatReleased / expiración) · seat:occupied (ReservationConfirmed).
 */
export function useLiveSeatMap(flightId: string | undefined, channel: 'flight' | 'dashboard' = 'flight') {
  const { reservations } = useServices();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activity, setActivity] = useState<SeatActivity[]>([]);
  const key = queryKeys.seatMap(flightId ?? '', user?.id);

  const query = useQuery({
    queryKey: key,
    queryFn: () => reservations.seatMap(flightId!),
    enabled: !!flightId,
    // Mientras la vista está montada el tiempo real mantiene el mapa al día. Al (re)entrar se consulta siempre
    // al servidor: los eventos emitidos mientras la vista no estaba abierta no se reciben.
    staleTime: 60_000,
    refetchOnMount: 'always',
  });

  const apply = useCallback(
    (event: SeatEvent) => {
      queryClient.setQueryData<SeatMapDto>(key, (map) => (map ? applySeatEvent(map, event, user?.id) : map));
      const mine = event.type !== 'released' && 'userId' in event.payload && event.payload.userId === user?.id;
      setActivity((list) =>
        [
          {
            id: `${event.type}-${event.payload.seatNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            at: new Date().toISOString(),
            seatNumber: event.payload.seatNumber,
            kind: event.type,
            mine,
          },
          ...list,
        ].slice(0, MAX_ACTIVITY),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, user?.id, flightId],
  );

  useRealtimeChannel(flightId ? (channel === 'flight' ? { kind: 'flight', flightId } : { kind: 'dashboard', flightId }) : null, {
    'seat:locked': (payload) => apply({ type: 'locked', payload }),
    'seat:released': (payload) => apply({ type: 'released', payload }),
    'seat:occupied': (payload) => apply({ type: 'occupied', payload }),
  });

  /** HU2 · endpoint 1: consulta puntual de un asiento (p. ej. tras un conflicto 409). */
  const refreshSeat = useCallback(
    async (seatNumber: string) => {
      if (!flightId) return;
      const seat = await reservations.seat(flightId, seatNumber);
      queryClient.setQueryData<SeatMapDto>(key, (map) => (map ? replaceSeat(map, seat) : map));
      return seat;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flightId, reservations, queryClient, user?.id],
  );

  return { ...query, activity, refreshSeat };
}
