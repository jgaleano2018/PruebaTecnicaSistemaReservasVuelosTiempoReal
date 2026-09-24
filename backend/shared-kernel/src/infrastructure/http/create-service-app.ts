import express, { Express, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { errorHandler, notFoundHandler } from './http-utils';
import { logger } from '../logging/logger';

export interface ServiceAppOptions {
  service: string;
  router: Router;
  corsOrigin?: string;
  /** Logs de acceso HTTP (desactivados en pruebas). */
  httpLogs?: boolean;
  jsonLimit?: string;
}

/**
 * Fábrica única de la aplicación Express para el monolito y los microservicios (DRY):
 * seguridad (helmet), CORS, JSON, logs, /health, API bajo /api/v1, 404 y manejo centralizado de errores.
 */
export function createServiceApp(opts: ServiceAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: !opts.corsOrigin || opts.corsOrigin === '*' ? true : opts.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: opts.jsonLimit ?? '100kb' }));
  if (opts.httpLogs !== false) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: opts.service, time: new Date().toISOString() }));
  app.use('/api/v1', opts.router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
