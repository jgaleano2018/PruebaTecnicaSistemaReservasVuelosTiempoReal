import { logger } from '../logging/logger';

type Task = () => unknown | Promise<unknown>;

/**
 * Apagado ordenado (SIGINT/SIGTERM) y registro de errores no controlados,
 * para que ningún fallo termine el proceso sin quedar en los logs.
 */
export function registerProcessHandlers(service: string, onShutdown: Task[]): void {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, `Apagando ${service}...`);
    for (const task of onShutdown) {
      try {
        await task();
      } catch (err) {
        logger.warn({ err }, 'Error durante el apagado');
      }
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Promesa rechazada sin manejar'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Excepción no controlada');
    void shutdown('uncaughtException');
  });
}

/** Ejecuta el bootstrap y termina el proceso con código 1 si falla. */
export function runService(service: string, bootstrap: () => Promise<void>): void {
  bootstrap().catch((err) => {
    logger.fatal({ err }, `No fue posible iniciar ${service}`);
    process.exit(1);
  });
}
