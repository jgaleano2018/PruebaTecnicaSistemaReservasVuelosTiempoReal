import { Express, Router } from 'express';
import { createServiceApp } from '@reservas-vuelos/service-kernel';

export function createHttpApp(router: Router, opts: { corsOrigin?: string } = {}): Express {
  return createServiceApp({ service: 'realtime-gateway', router, httpLogs: false, ...opts });
}
