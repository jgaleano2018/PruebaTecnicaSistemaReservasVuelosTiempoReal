import { Express, Router } from 'express';
import { createServiceApp } from '@reservas-vuelos/service-kernel';
import { Modules } from './container';

/** Adaptador HTTP del monolito: monta el router de cada módulo bajo /api/v1. */
export function createHttpApp(modules: Modules, opts: { corsOrigin?: string; httpLogs?: boolean } = {}): Express {
  const router = Router();
  for (const m of [modules.auth, modules.flight, modules.reservation, modules.customer, modules.realtime, modules.analytics]) {
    router.use(m.router);
  }
  return createServiceApp({ service: 'monolith', router, ...opts });
}
