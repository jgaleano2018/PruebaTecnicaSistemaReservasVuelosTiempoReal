import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@reservas-vuelos/shared';
import { asyncHandler, ok, validate, validated } from '../../../../shared/infrastructure/http/http-utils';
import { authenticate, authorize, JwtService } from '../../../../shared/infrastructure/auth/jwt';
import { AnalyticsUseCases } from '../../application/analytics.use-cases';

const rangeSchema = z.object({
  from: z.coerce.date().default(() => new Date(Date.now() - 30 * 24 * 3600 * 1000)),
  to: z.coerce.date().default(() => new Date(Date.now() + 24 * 3600 * 1000)),
});

export function buildAnalyticsRouter(jwt: JwtService, a: AnalyticsUseCases): Router {
  const r = Router();
  /** Métricas de ocupación de un vuelo (lectura pública para espectadores). */
  r.get('/analytics/flights/:flightId/metrics', asyncHandler(async (req, res) => ok(res, await a.flightMetrics(req.params.flightId))));

  /** Demanda y reportes (solo administradores). */
  r.get(
    '/analytics/demand',
    authenticate(jwt),
    authorize(UserRole.ADMIN),
    validate(rangeSchema, 'query'),
    asyncHandler(async (req, res) => {
      const q = validated<typeof rangeSchema>(req, 'query') as z.infer<typeof rangeSchema>;
      ok(res, await a.demand(q.from, q.to));
    }),
  );
  r.get('/analytics/reports/summary', authenticate(jwt), authorize(UserRole.ADMIN), asyncHandler(async (_req, res) => ok(res, await a.summary())));
  return r;
}
