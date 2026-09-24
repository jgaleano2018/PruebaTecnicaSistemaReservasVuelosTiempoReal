import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: process.env.SERVICE_NAME ?? 'reservas-vuelos' },
  transport:
    process.env.NODE_ENV === 'development' && process.env.PRETTY_LOGS !== 'false'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

export type Logger = typeof logger;
