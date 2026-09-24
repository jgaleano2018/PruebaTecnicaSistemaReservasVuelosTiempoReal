import express, { Express, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { errorHandler, notFoundHandler } from './shared/infrastructure/http/http-utils';
import { logger } from './shared/infrastructure/logging/logger';

export function createHttpApp(router: Router, opts: { corsOrigin?: string; httpLogs?: boolean; service: string }): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: opts.corsOrigin === '*' || !opts.corsOrigin ? true : opts.corsOrigin.split(',') }));
  app.use(express.json({ limit: '100kb' }));
  if (opts.httpLogs !== false) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: opts.service, time: new Date().toISOString() }));
  app.use('/api/v1', router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
