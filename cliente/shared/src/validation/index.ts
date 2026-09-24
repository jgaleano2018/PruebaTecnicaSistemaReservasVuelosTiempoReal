import { z } from 'zod';
import { CabinClass, FlightStatus } from '../enums';

/** Validaciones compartidas: el frontend las usa en formularios y el backend en los controladores. */

const iataCode = z
  .string()
  .trim()
  .length(3, 'El código IATA debe tener 3 letras')
  .regex(/^[A-Za-z]{3}$/, 'El código IATA solo admite letras')
  .transform((v) => v.toUpperCase());

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');

export const seatNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}[A-Ka-k]$/, 'Número de asiento inválido (ej. 12A)')
  .transform((v) => v.toUpperCase());

export const flightSearchQuerySchema = z.object({
  origin: iataCode,
  destination: iataCode,
  date: isoDate,
  cabinClass: z.nativeEnum(CabinClass).optional(),
  maxPrice: z.coerce.number().positive().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export const registerSchema = loginSchema.extend({
  fullName: z.string().trim().min(3, 'Nombre muy corto').max(120),
});

export const createSeatHoldSchema = z.object({
  flightId: z.string().trim().min(1),
  seatNumber: seatNumberSchema,
});

export const passengerSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  documentType: z.enum(['CC', 'CE', 'PASSPORT', 'TI']),
  documentNumber: z.string().trim().regex(/^[A-Za-z0-9]{5,20}$/, 'Documento inválido'),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{7,15}$/, 'Teléfono inválido')
    .optional(),
  birthDate: isoDate.optional(),
});

/** Algoritmo de Luhn para validar números de tarjeta (ficticios). */
export function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function detectCardBrand(cardNumber: string): string {
  const n = cardNumber.replace(/\D/g, '');
  if (/^4/.test(n)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'MASTERCARD';
  if (/^3[47]/.test(n)) return 'AMEX';
  return 'OTHER';
}

export const cardSchema = z
  .object({
    number: z
      .string()
      .transform((v) => v.replace(/[\s-]/g, ''))
      .refine(isValidLuhn, 'Número de tarjeta inválido'),
    holderName: z.string().trim().min(3).max(80),
    expiryMonth: z.coerce.number().int().min(1).max(12),
    expiryYear: z.coerce.number().int().min(2000).max(2100),
    cvv: z.string().regex(/^\d{3,4}$/, 'CVV inválido'),
  })
  .refine(
    (c) => {
      const now = new Date();
      const exp = new Date(c.expiryYear, c.expiryMonth, 0, 23, 59, 59);
      return exp >= now;
    },
    { message: 'La tarjeta está vencida', path: ['expiryMonth'] },
  );

export const processPaymentSchema = z.object({
  paymentIntentId: z.string().trim().min(1),
  passenger: passengerSchema,
  card: cardSchema,
});

export const refundSchema = z.object({
  reason: z.string().trim().min(3).max(200).default('Solicitud del cliente'),
});

export const updateFlightStatusSchema = z
  .object({
    status: z.nativeEnum(FlightStatus),
    delayMinutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.status !== FlightStatus.DELAYED || v.delayMinutes !== undefined, {
    message: 'delayMinutes es obligatorio cuando el estado es DELAYED',
    path: ['delayMinutes'],
  });

export type FlightSearchQueryInput = z.infer<typeof flightSearchQuerySchema>;
export type CreateSeatHoldInput = z.infer<typeof createSeatHoldSchema>;
export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
export type UpdateFlightStatusInput = z.infer<typeof updateFlightStatusSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

/** Parámetros de negocio compartidos. */
export const BusinessRules = {
  /** Minutos por defecto de bloqueo temporal de un asiento (HU2: 5-10 minutos). */
  DEFAULT_SEAT_LOCK_MINUTES: 7,
  MIN_SEAT_LOCK_MINUTES: 5,
  MAX_SEAT_LOCK_MINUTES: 10,
  /** Tarjeta de prueba que siempre es rechazada por la pasarela ficticia. */
  DECLINED_TEST_CARD: '4000000000000002',
  APPROVED_TEST_CARD: '4111111111111111',
} as const;
