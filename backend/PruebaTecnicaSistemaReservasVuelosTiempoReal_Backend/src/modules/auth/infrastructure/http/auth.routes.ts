import { Router } from 'express';
import { loginSchema, LoginInput, registerSchema, RegisterInput } from '@reservas-vuelos/shared';
import { asyncHandler, ok, validate, validated } from '../../../../shared/infrastructure/http/http-utils';
import { authenticate, JwtService } from '../../../../shared/infrastructure/auth/jwt';
import { AuthUseCases } from '../../application/auth.use-cases';

export function buildAuthRouter(jwt: JwtService, auth: AuthUseCases): Router {
  const r = Router();
  r.post(
    '/auth/register',
    validate(registerSchema),
    asyncHandler(async (req, res) => ok(res, await auth.register(validated<typeof registerSchema>(req) as RegisterInput), 201)),
  );
  r.post(
    '/auth/login',
    validate(loginSchema),
    asyncHandler(async (req, res) => ok(res, await auth.login(validated<typeof loginSchema>(req) as LoginInput))),
  );
  r.get('/auth/me', authenticate(jwt), asyncHandler(async (req, res) => ok(res, await auth.me(req.user!.sub))));
  return r;
}
