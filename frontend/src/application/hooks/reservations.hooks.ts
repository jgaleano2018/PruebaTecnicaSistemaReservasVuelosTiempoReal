import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ReservationStatus,
  type ProcessPaymentRequestDto,
  type ReservationConfirmedPayload,
  type SeatMapDto,
} from '@reservas-vuelos/shared';
import { applySeatEvent } from '@/domain/seat-map';
import { useAuth } from '../auth/auth-context';
import { queryKeys } from '../query-keys';
import { useRealtimeChannel } from '../realtime/use-realtime';
import { useServices } from '../services-context';

/** HU3: procesa el pago con datos ficticios (Payment Service → PaymentProcessed). */
export function useProcessPayment() {
  const { checkout } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProcessPaymentRequestDto) => checkout.pay(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.myPayments }),
  });
}

/**
 * HU3 · Regla de tiempo real: tras confirmarse la reserva el asiento queda OCUPADO de forma permanente.
 * Mientras el comprador estaba en el checkout, las vistas en vivo (mapa, resultados, dashboard) estaban
 * desmontadas y no recibieron `seat:occupied`, así que su caché conservaba el asiento como "bloqueado por mí".
 * Esta función aplica la ocupación sobre la caché y marca como obsoletas todas las lecturas afectadas,
 * para que cualquier vista (o una recarga) muestre el estado real del servidor.
 */
export function useApplyConfirmedReservation() {
  const queryClient = useQueryClient();
  return useCallback(
    (hold: { flightId: string; seatNumber: string; reservationId: string }, reservationCode?: string) => {
      const occupied = {
        type: 'occupied' as const,
        payload: {
          flightId: hold.flightId,
          seatNumber: hold.seatNumber,
          reservationId: hold.reservationId,
          reservationCode: reservationCode ?? '',
        } as ReservationConfirmedPayload,
      };
      queryClient.setQueriesData<SeatMapDto>({ queryKey: queryKeys.seatMapAll(hold.flightId) }, (map) =>
        map ? applySeatEvent(map, occupied) : map,
      );
      const affected = [
        queryKeys.seatMapAll(hold.flightId),
        queryKeys.flight(hold.flightId),
        queryKeys.flightSearchAll,
        queryKeys.reservation(hold.reservationId),
        queryKeys.ticket(hold.reservationId),
        queryKeys.myReservations,
        queryKeys.myPayments,
        ['dashboard'],
      ];
      for (const queryKey of affected) void queryClient.invalidateQueries({ queryKey });
    },
    [queryClient],
  );
}

export type ConfirmationState =
  | { status: 'idle' }
  | { status: 'waiting'; paymentEvent?: boolean }
  | { status: 'confirmed'; reservationCode?: string }
  | { status: 'failed'; reason: string }
  | { status: 'timeout' };

const CONFIRMATION_TIMEOUT_MS = 45_000;

/**
 * Tras un pago aprobado, la reserva se confirma de forma ASÍNCRONA en el monolito
 * (PaymentProcessed → Kafka → Reservas → ReservationConfirmed). Se espera el evento
 * `reservation:confirmed` del gateway y, como respaldo, se consulta la reserva por REST.
 */
export function useAwaitConfirmation(reservationId: string | undefined, enabled: boolean): ConfirmationState {
  const { reservations } = useServices();
  const [state, setState] = useState<ConfirmationState>({ status: 'idle' });
  const waiting = enabled && !!reservationId && (state.status === 'idle' || state.status === 'waiting');

  useEffect(() => {
    if (!enabled || !reservationId) return;
    setState({ status: 'waiting' });
    const timer = setTimeout(
      () => setState((s) => (s.status === 'waiting' ? { status: 'timeout' } : s)),
      CONFIRMATION_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [enabled, reservationId]);

  useRealtimeChannel(waiting && reservationId ? { kind: 'reservation', reservationId } : null, {
    // PaymentProcessed (Payment Service → Kafka → gateway): el pago quedó registrado en el bus de eventos
    'payment:processed': () => setState((s) => (s.status === 'waiting' ? { status: 'waiting', paymentEvent: true } : s)),
    'reservation:confirmed': (p) => setState({ status: 'confirmed', reservationCode: p.reservationCode }),
    'reservation:failed': (p) => setState({ status: 'failed', reason: p.reason }),
  });

  const poll = useQuery({
    queryKey: queryKeys.reservation(reservationId ?? ''),
    queryFn: () => reservations.reservation(reservationId!),
    enabled: waiting,
    refetchInterval: waiting ? 2000 : false,
  });

  useEffect(() => {
    const r = poll.data;
    if (!r || !waiting) return;
    if (r.status === ReservationStatus.CONFIRMED) setState({ status: 'confirmed', reservationCode: r.reservationCode });
    else if (r.status === ReservationStatus.FAILED || r.status === ReservationStatus.CANCELLED)
      setState({ status: 'failed', reason: 'La reserva no pudo confirmarse; el pago será reembolsado automáticamente.' });
  }, [poll.data, waiting]);

  return state;
}

export function useTicket(reservationId: string | undefined) {
  const { reservations } = useServices();
  return useQuery({
    queryKey: queryKeys.ticket(reservationId ?? ''),
    queryFn: () => reservations.ticketByReservation(reservationId!),
    enabled: !!reservationId,
  });
}

export function useTicketLookup() {
  const { reservations } = useServices();
  return useMutation({ mutationFn: (code: string) => reservations.ticketByCode(code) });
}

export function useMyReservations() {
  const { reservations } = useServices();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const result = useQuery({ queryKey: queryKeys.myReservations, queryFn: () => reservations.myReservations(), enabled: !!user });
  return {
    ...result,
    refresh: () => queryClient.invalidateQueries({ queryKey: queryKeys.myReservations }),
  };
}

export function useMyPayments() {
  const { checkout } = useServices();
  const { user } = useAuth();
  return useQuery({ queryKey: queryKeys.myPayments, queryFn: () => checkout.myPayments(), enabled: !!user });
}

export function useRefund() {
  const { checkout } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => checkout.refund(paymentId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myPayments });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myReservations });
    },
  });
}

export function useMyCustomerProfiles() {
  const { customers } = useServices();
  const { user } = useAuth();
  return useQuery({ queryKey: queryKeys.myCustomers, queryFn: () => customers.mine(), enabled: !!user });
}

export function useUpdateContact() {
  const { customers } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, contact }: { customerId: string; contact: { email?: string; phone?: string } }) =>
      customers.updateContact(customerId, contact),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.myCustomers }),
  });
}
