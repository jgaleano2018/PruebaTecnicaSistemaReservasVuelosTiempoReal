import type { AirportDto } from '@reservas-vuelos/shared';

const LOCALE = 'es-CO';

export function formatMoney(amount: number, currency = 'COP'): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(amount);
}

/** Formatea fechas ISO de forma segura: una fecha inválida o ausente se muestra como "—". */
function safeFormat(iso: string | undefined | null, options: Intl.DateTimeFormatOptions): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, options).format(date);
}

export function formatTime(iso: string | undefined | null): string {
  return safeFormat(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(iso: string | undefined | null): string {
  return safeFormat(iso, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string | undefined | null): string {
  return safeFormat(iso, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value)} %`;
}

/** mm:ss para el temporizador de bloqueo. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Fecha local en formato YYYY-MM-DD (lo que espera la API). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** El backend puede devolver el aeropuerto expandido o solo el código IATA. */
export function airportCode(a: AirportDto | string): string {
  return typeof a === 'string' ? a : a.code;
}

export function airportCity(a: AirportDto | string): string {
  return typeof a === 'string' ? a : a.city;
}
