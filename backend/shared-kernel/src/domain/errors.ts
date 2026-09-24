/** Errores de dominio: el adaptador HTTP los traduce a códigos de estado. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} '${id}' no existe`, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'No autenticado') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'No tiene permisos para esta operación') {
    super('FORBIDDEN', message, 403);
  }
}
