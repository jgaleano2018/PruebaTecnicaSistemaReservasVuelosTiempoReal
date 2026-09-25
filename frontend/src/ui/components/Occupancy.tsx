import type { ReactNode } from 'react';
import { formatPercent } from '@/domain/format';
import { occupancyShares } from '@/domain/occupancy';
import { cx } from './primitives';

interface Counts {
  total: number;
  available: number;
  locked: number;
  occupied: number;
}

/**
 * Barra apilada de ocupación (ocupados · bloqueados · disponibles).
 * Identidad por color + textura en bloqueados + leyenda con valores (nunca solo color); tooltip nativo por segmento.
 */
export function OccupancyBar({ counts, showLegend = true, size = 'md', label }: { counts: Counts; showLegend?: boolean; size?: 'sm' | 'md'; label?: string }) {
  const shares = occupancyShares(counts);
  const segments = [
    { key: 'occupied', label: 'Ocupados', value: counts.occupied, share: shares.occupied },
    { key: 'locked', label: 'Bloqueados', value: counts.locked, share: shares.locked },
    { key: 'available', label: 'Disponibles', value: counts.available, share: shares.available },
  ];
  const summary = `${label ? `${label}: ` : ''}${counts.occupied} ocupados, ${counts.locked} bloqueados y ${counts.available} disponibles de ${counts.total}`;
  return (
    <div className={cx('occ', `occ--${size}`)}>
      <div className="occ__bar" role="img" aria-label={summary}>
        {segments.map(
          (s) =>
            s.share > 0 && (
              <span
                key={s.key}
                className={`occ__seg occ__seg--${s.key}`}
                style={{ flexGrow: s.share }}
                title={`${s.label}: ${s.value} (${formatPercent(s.share)})`}
              />
            ),
        )}
      </div>
      {showLegend && (
        <ul className="occ__legend">
          {segments.map((s) => (
            <li key={s.key}>
              <span className={`occ__swatch occ__seg--${s.key}`} aria-hidden="true" />
              <span className="occ__legend-label">{s.label}</span>
              <strong className="tabular">{s.value.toLocaleString('es-CO')}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function KpiTile({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'available' | 'locked' | 'occupied' | 'brand'; icon?: ReactNode }) {
  return (
    <div className={cx('kpi', tone && `kpi--${tone}`)}>
      <div className="kpi__head">
        {icon && (
          <span className="kpi__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="kpi__label">{label}</span>
      </div>
      <p className="kpi__value tabular">{value}</p>
      {hint && <p className="kpi__hint">{hint}</p>}
    </div>
  );
}
