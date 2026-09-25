import { BusinessRules } from '@reservas-vuelos/shared';

/** Milisegundos restantes de un bloqueo temporal. */
export function remainingMs(expiresAt: string, now: number = Date.now()): number {
  return Math.max(0, new Date(expiresAt).getTime() - now);
}

export function isExpired(expiresAt: string, now: number = Date.now()): boolean {
  return remainingMs(expiresAt, now) === 0;
}

export type Urgency = 'calm' | 'warning' | 'critical' | 'expired';

/** Nivel de urgencia visual del temporizador (a11y: también se anuncia por texto). */
export function holdUrgency(ms: number): Urgency {
  if (ms <= 0) return 'expired';
  if (ms <= 60_000) return 'critical';
  if (ms <= 2 * 60_000) return 'warning';
  return 'calm';
}

/**
 * Duración total del bloqueo. El backend la define por configuración (SEAT_LOCK_MINUTES, 5-10 min),
 * así que se deriva de las fechas del propio bloqueo; si no se conoce el inicio, se usa el valor por defecto.
 */
export function holdDurationMs(expiresAt: string, startedAt?: string | null): number {
  const fallback = BusinessRules.DEFAULT_SEAT_LOCK_MINUTES * 60_000;
  if (!startedAt) return fallback;
  const total = new Date(expiresAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(total) && total > 0 ? total : fallback;
}

/** Fracción consumida del bloqueo (0..1) para la barra de progreso. */
export function holdProgress(expiresAt: string, now: number = Date.now(), startedAt?: string | null): number {
  const total = holdDurationMs(expiresAt, startedAt);
  return Math.min(1, Math.max(0, 1 - remainingMs(expiresAt, now) / total));
}
