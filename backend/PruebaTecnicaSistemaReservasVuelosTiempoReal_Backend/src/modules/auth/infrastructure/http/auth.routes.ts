import { Router } from 'express';
import { loginSchema, registerSchema } from '@reservas-vuelos/shared';
import { asyncHandler, ok, validate, validated, authenticate, JwtService } from '@reservas-vuelos/service-kernel';
import { AuthUseCases } from '../../application/auth.use-cases';

export function buildAuthRouter(jwt: JwtService, auth: AuthUseCases): Router {
  const r = Router();
  r.post(
    '/auth/register',
    validate(registerSchema),
    asyncHandler(async (req, res) => ok(res, await auth.register(validated<typeof registerSchema>(req)), 201)),
  );
  r.post(
    '/auth/login',
    validate(loginSchema),
    asyncHandler(async (req, res) => ok(res, await auth.login(validated<typeof loginSchema>(req)))),
  );
  r.get('/auth/me', authenticate(jwt), asyncHandler(async (req, res) => ok(res, await auth.me(req.user!.sub))));
  return r;
}
