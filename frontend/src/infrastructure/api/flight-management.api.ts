import type {
  DashboardOverviewDto,
  FlightOccupancyDto,
  FlightStatus,
  FlightStatusHistoryDto,
  UpdateFlightStatusRequestDto,
} from '@reservas-vuelos/shared';
import type {
  FlightManagementGateway,
  ManagedFlightDto,
  OccupancyStreamHandlers,
  SyncLogDto,
  Unsubscribe,
} from '@/application/ports';
import { buildUrl, type HttpClient } from '../http/http-client';
import { defaultEventSourceFactory, listenSse, type EventSourceFactory } from '../realtime/event-source';

const enc = encodeURIComponent;

/**
 * Adaptador del Flight Management Service (http://localhost:3001/api/v1):
 * gestión avanzada de vuelos (estados, sincronización con aerolíneas) y el dashboard de ocupación (HU4)
 * vía REST y SSE (`/dashboard/.../stream`).
 */
export class FlightManagementApi implements FlightManagementGateway {
  constructor(
    private readonly http: HttpClient,
    private readonly eventSourceFactory: EventSourceFactory = defaultEventSourceFactory,
  ) {}

  overview(hoursAhead = 72) {
    return this.http.get<DashboardOverviewDto>('/dashboard/overview', { query: { hoursAhead } });
  }
  flightsOccupancy(date?: string) {
    return this.http.get<FlightOccupancyDto[]>('/dashboard/flights', { query: { date } });
  }
  occupancy(flightId: string) {
    return this.http.get<FlightOccupancyDto>(`/dashboard/flights/${enc(flightId)}/occupancy`);
  }

  streamOccupancy(flightId: string | undefined, handlers: OccupancyStreamHandlers): Unsubscribe {
    const path = flightId ? `/dashboard/flights/${enc(flightId)}/stream` : '/dashboard/stream';
    return listenSse({
      url: buildUrl(this.http.baseUrl, path),
      factory: this.eventSourceFactory,
      onOpen: handlers.onOpen,
      onError: handlers.onError,
      events: {
        snapshot: (d) => (handlers.onSnapshot ?? handlers.onOccupancy)(d as FlightOccupancyDto),
        occupancy: (d) => handlers.onOccupancy(d as FlightOccupancyDto),
      },
    });
  }

  flights(filter: { date?: string; status?: FlightStatus; origin?: string; destination?: string }) {
    return this.http.get<ManagedFlightDto[]>('/flights', { query: filter });
  }
  flight(flightId: string) {
    return this.http.get<ManagedFlightDto>(`/flights/${enc(flightId)}`);
  }
  statusHistory(flightId: string) {
    return this.http.get<FlightStatusHistoryDto[]>(`/flights/${enc(flightId)}/status-history`);
  }
  changeStatus(flightId: string, input: UpdateFlightStatusRequestDto) {
    return this.http.patch<unknown>(`/flights/${enc(flightId)}/status`, input, { auth: 'required' });
  }
  syncFlights() {
    return this.http.post<{ synchronized: number }>('/flights/sync', undefined, { auth: 'required' });
  }
  syncAirlines() {
    return this.http.post<unknown>('/airlines/sync', {}, { auth: 'required' });
  }
  syncLog() {
    return this.http.get<SyncLogDto[]>('/sync/log', { auth: 'required' });
  }
}
