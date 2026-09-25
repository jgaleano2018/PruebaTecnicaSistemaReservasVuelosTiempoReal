import { Express, Router } from 'express';
import { createServiceApp } from '@reservas-vuelos/service-kernel';

export function createHttpApp(router: Router, opts: { corsOrigin?: string; httpLogs?: boolean; service: string }): Express {
  return createServiceApp({ router, ...opts });
}
