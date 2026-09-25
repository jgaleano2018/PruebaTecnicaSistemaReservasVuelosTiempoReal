import type {
  CheckoutHoldResponseDto,
  PaymentDto,
  PaymentIntentDto,
  ProcessPaymentRequestDto,
  RefundDto,
} from '@reservas-vuelos/shared';
import type { CheckoutGateway } from '@/application/ports';
import type { HttpClient } from '../http/http-client';

const enc = encodeURIComponent;

/**
 * Adaptador REST del Payment Service (http://localhost:3002/api/v1).
 * Según el diagrama, el bloqueo temporal del asiento se solicita al Payment Service,
 * que a su vez invoca al Módulo de Reservas del monolito (quien emite SeatLocked a Kafka).
 */
export class PaymentServiceApi implements CheckoutGateway {
  constructor(private readonly http: HttpClient) {}

  createHold(flightId: string, seatNumber: string) {
    return this.http.post<CheckoutHoldResponseDto>('/checkout/holds', { flightId, seatNumber }, { auth: 'required' });
  }
  releaseHold(reservationId: string) {
    return this.http.delete<unknown>(`/checkout/holds/${enc(reservationId)}`, { auth: 'required' });
  }
  paymentIntent(intentId: string) {
    return this.http.get<PaymentIntentDto>(`/payment-intents/${enc(intentId)}`, { auth: 'required' });
  }
  /** 201 = aprobado, 402 = rechazado: en ambos casos se devuelve el PaymentDto con su estado. */
  pay(input: ProcessPaymentRequestDto) {
    return this.http.post<PaymentDto>('/payments', input, { auth: 'required' });
  }
  myPayments() {
    return this.http.get<PaymentDto[]>('/payments/me', { auth: 'required' });
  }
  payment(paymentId: string) {
    return this.http.get<PaymentDto>(`/payments/${enc(paymentId)}`, { auth: 'required' });
  }
  refund(paymentId: string, reason: string) {
    return this.http.post<RefundDto>(`/payments/${enc(paymentId)}/refunds`, { reason }, { auth: 'required' });
  }
}
