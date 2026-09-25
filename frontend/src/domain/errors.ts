/**
 * Error de aplicación normalizado. Todos los adaptadores (HTTP, tiempo real) traducen
 * sus fallos a esta clase para que la UI muestre mensajes consistentes.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'UNKNOWN_ERROR',
    public readonly status: number = 0,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }
}

/** Mensajes en lenguaje de usuario para los códigos de error conocidos del backend. */
const FRIENDLY_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'No fue posible conectar con el servidor. Verifique que los servicios estén en ejecución.',
  TIMEOUT: 'El servidor tardó demasiado en responder. Intente de nuevo.',
  UNAUTHORIZED: 'Su sesión expiró o no ha iniciado sesión.',
  FORBIDDEN: 'No tiene permisos para realizar esta operación.',
  SEAT_NOT_AVAILABLE: 'Otro pasajero acaba de tomar este asiento. Elija uno diferente.',
  MAX_HOLDS_REACHED: 'Alcanzó el máximo de asientos bloqueados para este vuelo.',
  FLIGHT_NOT_BOOKABLE: 'Este vuelo ya no admite reservas.',
  HOLD_NOT_ACTIVE: 'El bloqueo del asiento ya no está activo.',
  ROUTE_NOT_FOUND: 'El recurso solicitado no existe en el servidor.',
};

/** Convierte cualquier error en un mensaje presentable. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) {
    return FRIENDLY_MESSAGES[error.code] ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

/** Extrae los errores por campo que envía el backend (zod `flatten()`). */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  if (!(error instanceof AppError)) return {};
  const details = error.details as { fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(details?.fieldErrors ?? {})) {
    if (messages?.length) result[field] = messages[0];
  }
  return result;
}
