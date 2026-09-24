import { catchError, EMPTY, exhaustMap, from, interval, Subscription } from 'rxjs';
import { logger } from '@reservas-vuelos/service-kernel';
import { ExpireSeatHoldsUseCase } from '../../application/seat-hold.use-cases';

/**
 * Barrido reactivo de bloqueos vencidos (liberación por tiempo expirado).
 * `exhaustMap` evita solapar ejecuciones si una tarda más que el intervalo.
 */
export class HoldExpirationScheduler {
  private sub?: Subscription;

  constructor(
    private readonly expireHolds: ExpireSeatHoldsUseCase,
    private readonly periodMs: number,
  ) {}

  start(): void {
    this.sub = interval(this.periodMs)
      .pipe(
        exhaustMap(() =>
          from(this.expireHolds.execute()).pipe(
            catchError((err) => {
              logger.error({ err }, 'Error liberando bloqueos vencidos');
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe((released) => {
        if (released > 0) logger.info({ released }, 'Asientos liberados por expiración del bloqueo');
      });
  }

  stop(): void {
    this.sub?.unsubscribe();
  }
}
