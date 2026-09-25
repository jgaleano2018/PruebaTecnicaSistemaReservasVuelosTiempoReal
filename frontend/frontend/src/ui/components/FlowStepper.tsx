import { cx } from './primitives';

/** Flujo principal de usuario del diagrama de arquitectura (pasos 1 a 5). */
export const FLOW_STEPS = ['Busca vuelos', 'Selecciona asiento', 'Datos y pago', 'Obtiene su boleto', 'Monitorea en tiempo real'] as const;

export function FlowStepper({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <nav className="stepper" aria-label="Progreso de la reserva">
      <ol>
        {FLOW_STEPS.slice(0, 4).map((label, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'current' : 'todo';
          return (
            <li key={label} className={cx('stepper__item', `stepper__item--${state}`)} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="stepper__num" aria-hidden="true">
                {state === 'done' ? '✓' : n}
              </span>
              <span className="stepper__label">
                {label}
                {state === 'done' && <span className="visually-hidden"> (completado)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
