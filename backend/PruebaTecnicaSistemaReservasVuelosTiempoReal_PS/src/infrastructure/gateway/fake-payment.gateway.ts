import { firstValueFrom, timer } from 'rxjs';
import { CardDto, detectCardBrand } from '@reservas-vuelos/shared';
import { GatewayResult, PaymentGateway } from '../../domain/payment';

/**
 * Pasarela de pagos simulada (datos ficticios). Reglas de prueba:
 *  - termina en 0002 -> rechazada (fondos insuficientes)
 *  - termina en 0069 -> rechazada (tarjeta reportada)
 *  - cualquier otra tarjeta válida (Luhn) -> aprobada
 */
export class FakePaymentGateway implements PaymentGateway {
  constructor(private readonly latencyMs = 400) {}

  async charge(input: { amount: number; currency: string; card: CardDto; reference: string }): Promise<GatewayResult> {
    await firstValueFrom(timer(this.latencyMs));
    const number = input.card.number.replace(/\D/g, '');
    const base = { cardBrand: detectCardBrand(number), cardLast4: number.slice(-4) };
    if (number.endsWith('0002')) return { ...base, approved: false, declineReason: 'Fondos insuficientes' };
    if (number.endsWith('0069')) return { ...base, approved: false, declineReason: 'Tarjeta reportada como robada' };
    return { ...base, approved: true, authorizationCode: String(Math.floor(100000 + Math.random() * 900000)) };
  }

  async refund(): Promise<{ ok: boolean }> {
    await firstValueFrom(timer(this.latencyMs / 2));
    return { ok: true };
  }
}
