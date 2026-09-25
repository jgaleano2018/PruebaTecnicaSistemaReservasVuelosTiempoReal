import { ApiErrorResponse, ApiResponse, SeatHoldDto } from '@reservas-vuelos/shared';
import { DomainError } from '../../shared/domain/errors';
import { ReservationHoldClient } from '../../domain/payment';

/** Adaptador HTTP hacia el módulo de Reservas del monolito (propaga el JWT del cliente). */
export class HttpReservationHoldClient implements ReservationHoldClient {
  constructor(private readonly baseUrl: string) {}

  private async call<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new DomainError('RESERVATION_SERVICE_UNAVAILABLE', 'El módulo de reservas no está disponible', 503);
    }
    const json = (await res.json().catch(() => ({}))) as ApiResponse<T> | ApiErrorResponse;
    if (!res.ok || !json.success) {
      const err = (json as ApiErrorResponse).error;
      // Se propaga el error de negocio (p. ej. 409 SEAT_NOT_AVAILABLE) tal cual al cliente
      throw new DomainError(err?.code ?? 'UPSTREAM_ERROR', err?.message ?? `Error ${res.status}`, res.status, err?.details);
    }
    return json.data;
  }

  createHold(input: { flightId: string; seatNumber: string }, token: string) {
    return this.call<SeatHoldDto>('POST', '/reservations/holds', token, input);
  }

  releaseHold(reservationId: string, token: string) {
    return this.call<SeatHoldDto>('DELETE', `/reservations/holds/${encodeURIComponent(reservationId)}`, token);
  }
}
