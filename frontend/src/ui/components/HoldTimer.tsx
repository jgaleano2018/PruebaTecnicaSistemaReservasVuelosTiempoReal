import { useEffect, useRef, useState } from 'react';
import { formatCountdown } from '@/domain/format';
import { holdProgress, holdUrgency, remainingMs } from '@/domain/hold';
import { ClockIcon } from './icons';
import { cx } from './primitives';

/** Tiempo actual que se actualiza cada `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const ANNOUNCE_AT = [5 * 60, 2 * 60, 60, 30, 10];

/**
 * Temporizador del bloqueo temporal (HU2: 5-10 min). La expiración real la decide el backend
 * (barrido → SeatReleased); aquí solo se visualiza y se anuncia a lectores de pantalla en hitos clave.
 */
export function HoldTimer({
  expiresAt,
  startedAt,
  compact = false,
}: {
  expiresAt: string;
  /** Inicio del bloqueo (p. ej. paymentIntent.createdAt) para calcular la duración real configurada en el backend */
  startedAt?: string | null;
  compact?: boolean;
}) {
  const now = useNow(1000);
  const ms = remainingMs(expiresAt, now);
  const urgency = holdUrgency(ms);
  const progress = holdProgress(expiresAt, now, startedAt);
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef(new Set<number>());

  const seconds = Math.ceil(ms / 1000);
  useEffect(() => {
    const mark = ANNOUNCE_AT.find((s) => seconds <= s && seconds > s - 2);
    if (mark && !announced.current.has(mark)) {
      announced.current.add(mark);
      setAnnouncement(mark >= 60 ? `Quedan ${mark / 60} minutos de bloqueo del asiento` : `Quedan ${mark} segundos de bloqueo del asiento`);
    }
    if (seconds === 0 && !announced.current.has(0)) {
      announced.current.add(0);
      setAnnouncement('El tiempo de bloqueo del asiento terminó');
    }
  }, [seconds]);

  return (
    <div className={cx('hold-timer', `hold-timer--${urgency}`, compact && 'hold-timer--compact')}>
      <div className="hold-timer__row">
        <ClockIcon size={18} />
        <span className="hold-timer__label">{urgency === 'expired' ? 'Bloqueo expirado' : 'Asiento reservado por'}</span>
        <time className="hold-timer__time" dateTime={`PT${seconds}S`} aria-hidden="true">
          {formatCountdown(ms)}
        </time>
      </div>
      <div
        className="hold-timer__bar"
        role="progressbar"
        aria-label="Tiempo restante del bloqueo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((1 - progress) * 100)}
        aria-valuetext={`${formatCountdown(ms)} restantes`}
      >
        <span style={{ transform: `scaleX(${1 - progress})` }} />
      </div>
      <span className="visually-hidden" aria-live="assertive">
        {announcement}
      </span>
    </div>
  );
}
