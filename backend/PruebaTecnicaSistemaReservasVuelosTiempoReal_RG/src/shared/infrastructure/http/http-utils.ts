import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodTypeAny, z } from 'zod';
import { ApiErrorResponse, ApiResponse } from '@reservas-vuelos/shared';
import { DomainError, ValidationError } from '../../domain/errors';
import { logger } from '../logging/logger';

/** Envuelve controladores async y propaga errores al manejador global. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Valida body/query/params con esquemas zod compartidos (DTOs). */
export function validate<S extends ZodTypeAny>(schema: S, source: 'body' | 'query' | 'params' = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new ValidationError('Datos de entrada inválidos', result.error.flatten()));
    }
    (req as any).validated = { ...((req as any).validated ?? {}), [source]: result.data };
    next();
  };
}

export function validated<S extends ZodTypeAny>(req: Request, source: 'body' | 'query' | 'params' = 'body'): z.infer<S> {
  return (req as any).validated?.[source];
}

export function ok<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>): Response {
  const body: ApiResponse<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return res.status(status).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorResponse = {
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `Ruta ${req.method} ${req.originalUrl} no existe` },
  };
  res.status(404).json(body);
}

/** Manejo centralizado de errores y logs. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    if (err.httpStatus >= 500) logger.error({ err }, err.message);
    const body: ApiErrorResponse = {
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.httpStatus).json(body);
    return;
  }
  if (err instanceof ZodError) {
    res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: err.flatten() } });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as any)) {
    res.status(400).json({ success: false, error: { code: 'BAD_JSON', message: 'JSON mal formado' } });
    return;
  }
  logger.error({ err, path: req.originalUrl }, 'Error no controlado');
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
}
