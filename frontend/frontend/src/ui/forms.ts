import type { ZodError } from 'zod';

/** Convierte un ZodError en un mapa campo → primer mensaje (soporta rutas anidadas: "card.number"). */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Agrupa el número de tarjeta en bloques de 4 mientras se escribe. */
export function formatCardNumber(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}
