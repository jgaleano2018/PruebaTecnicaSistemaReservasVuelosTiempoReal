import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@reservas-vuelos/shared';
import {
  asyncHandler,
  ok,
  validate,
  validated,
  authenticate,
  authorize,
  JwtService,
} from '@reservas-vuelos/service-kernel';
import { CustomerQueries } from '../../application/customer.use-cases';

const contactSchema = z
  .object({ email: z.string().email().optional(), phone: z.string().regex(/^\+?\d{7,15}$/).optional() })
  .refine((v) => v.email || v.phone, 'Debe enviar email o phone');

const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export function buildCustomerRouter(jwt: JwtService, q: CustomerQueries): Router {
  const r = Router();
  r.use('/customers', authenticate(jwt));

  r.get('/customers/me', asyncHandler(async (req, res) => ok(res, await q.mine(req.user!.sub))));

  r.get(
    '/customers',
    authorize(UserRole.ADMIN),
    validate(pagination, 'query'),
    asyncHandler(async (req, res) => {
      const p = validated<typeof pagination>(req, 'query');
      ok(res, await q.list(p.limit, p.skip));
    }),
  );

  r.get('/customers/:customerId', asyncHandler(async (req, res) => ok(res, await q.byId(req.params.customerId, req.user!))));

  r.get(
    '/customers/:customerId/reservations',
    asyncHandler(async (req, res) => ok(res, await q.reservations(req.params.customerId, req.user!))),
  );

  r.patch(
    '/customers/:customerId/contact',
    validate(contactSchema),
    asyncHandler(async (req, res) => {
      ok(res, await q.updateContact(req.params.customerId, validated<typeof contactSchema>(req), req.user!));
    }),
  );
  return r;
}
