import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { errorHandler, notFoundHandler } from './shared/infrastructure/http/http-utils';
import { logger } from './shared/infrastructure/logging/logger';
import { Modules } from './container';

export function createHttpApp(modules: Modules, opts: { corsOrigin?: string; httpLogs?: boolean } = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: opts.corsOrigin === '*' || !opts.corsOrigin ? true : opts.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  if (opts.httpLogs !== false) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'monolith', time: new Date().toISOString() }));

  const api = express.Router();
  api.use(modules.auth.router);
  api.use(modules.flight.router);
  api.use(modules.reservation.router);
  api.use(modules.customer.router);
  api.use(modules.realtime.router);
  api.use(modules.analytics.router);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
