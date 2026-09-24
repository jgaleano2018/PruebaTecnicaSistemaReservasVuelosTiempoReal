import express, { Express, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './shared/infrastructure/http/http-utils';

export function createHttpApp(router: Router, opts: { corsOrigin?: string }): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: opts.corsOrigin === '*' || !opts.corsOrigin ? true : opts.corsOrigin.split(',') }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'realtime-gateway', time: new Date().toISOString() }));
  app.use('/api/v1', router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
