import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlightStatus } from '@reservas-vuelos/shared';
import { queryKeys } from '../query-keys';
import { useRealtimeChannel } from '../realtime/use-realtime';
import { useServices } from '../services-context';

export interface ManagedFlightFilter {
  date?: string;
  status?: FlightStatus;
  origin?: string;
  destination?: string;
}

/** Flight Management Service · Gestión avanzada de vuelos (Administrador). */
export function useManagedFlights(filter: ManagedFlightFilter) {
  const { flightManagement } = useServices();
  const queryClient = useQueryClient();
  const result = useQuery({
    queryKey: queryKeys.managedFlights(filter),
    queryFn: () => flightManagement.flights(filter),
  });
  useRealtimeChannel({ kind: 'flights' }, {
    'flight:status-changed': () => void queryClient.invalidateQueries({ queryKey: queryKeys.managedFlightsAll }),
  });
  return result;
}

export function useSyncLog() {
  const { flightManagement } = useServices();
  return useQuery({ queryKey: queryKeys.syncLog, queryFn: () => flightManagement.syncLog() });
}

export function useSyncActions() {
  const { flightManagement } = useServices();
  const queryClient = useQueryClient();
  const after = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.syncLog });
    void queryClient.invalidateQueries({ queryKey: queryKeys.managedFlightsAll });
  };
  return {
    catalog: useMutation({ mutationFn: () => flightManagement.syncFlights(), onSuccess: after }),
    airlines: useMutation({ mutationFn: () => flightManagement.syncAirlines(), onSuccess: after }),
  };
}

export function useSummaryReport() {
  const { analytics } = useServices();
  return useQuery({ queryKey: queryKeys.summary, queryFn: () => analytics.summary() });
}

export function useDemandReport() {
  const { analytics } = useServices();
  return useQuery({ queryKey: queryKeys.demand, queryFn: () => analytics.demand() });
}

export function useRealtimeStatus() {
  const { analytics } = useServices();
  return useQuery({ queryKey: queryKeys.realtimeStatus, queryFn: () => analytics.realtimeStatus(), refetchInterval: 5000 });
}

export function useCustomers(limit = 50, skip = 0) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customers(limit, skip), queryFn: () => customers.list(limit, skip) });
}

export function useCustomerReservations(customerId: string | null) {
  const { customers } = useServices();
  return useQuery({
    queryKey: queryKeys.customerReservations(customerId ?? ''),
    queryFn: () => customers.reservations(customerId!),
    enabled: !!customerId,
  });
}
