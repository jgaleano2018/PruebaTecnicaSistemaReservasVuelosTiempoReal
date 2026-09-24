import { ApiResponse, FlightDto, SeatStatus } from '@reservas-vuelos/shared';
import { DomainError } from '@reservas-vuelos/service-kernel';
import { FlightCatalogClient } from '../../domain/ports';

/** Adaptador HTTP hacia los endpoints internos del monolito modular. */
export class HttpMonolithCatalogClient implements FlightCatalogClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalApiKey: string,
  ) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      headers: { 'x-internal-api-key': this.internalApiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new DomainError('UPSTREAM_ERROR', `Monolito respondió ${res.status} en ${path}`, 502);
    return ((await res.json()) as ApiResponse<T>).data;
  }

  listFlights(from: Date, to: Date): Promise<FlightDto[]> {
    return this.get(`/internal/flights?from=${from.toISOString()}&to=${to.toISOString()}`);
  }

  getSeatStates(flightId: string): Promise<{ seatNumber: string; status: SeatStatus }[]> {
    return this.get(`/internal/flights/${encodeURIComponent(flightId)}/seats`);
  }
}
