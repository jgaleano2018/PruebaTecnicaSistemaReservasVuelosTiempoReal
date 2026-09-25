import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CabinClass, SeatStatus, type SeatDto, type SeatMapDto } from '@reservas-vuelos/shared';
import { formatMoney } from '@/domain/format';
import { cabinLabel, seatPositionLabel, seatStatusLabel } from '@/domain/labels';
import { buildCabinLayout, isSelectable } from '@/domain/seat-map';
import { cx } from './primitives';

export interface SeatMapProps {
  map: SeatMapDto;
  /** Asiento del bloqueo activo del usuario */
  selectedSeat?: string | null;
  /** Asiento cuya solicitud de bloqueo está en curso */
  pendingSeat?: string | null;
  onSelect?: (seat: SeatDto) => void;
  readOnly?: boolean;
  /** Asientos que cambiaron recientemente (resaltado breve) */
  highlight?: ReadonlySet<string>;
}

function seatState(seat: SeatDto, selectedSeat?: string | null): 'mine' | 'available' | 'locked' | 'occupied' {
  if (seat.seatNumber === selectedSeat || (seat.status === SeatStatus.LOCKED && seat.lockedByMe)) return 'mine';
  if (seat.status === SeatStatus.AVAILABLE) return 'available';
  if (seat.status === SeatStatus.LOCKED) return 'locked';
  return 'occupied';
}

function seatLabel(seat: SeatDto, state: ReturnType<typeof seatState>): string {
  const status = state === 'mine' ? 'Bloqueado por usted' : seatStatusLabel[seat.status];
  return `Asiento ${seat.seatNumber}, ${seatPositionLabel[seat.position]}, ${cabinLabel[seat.cabinClass]}, ${formatMoney(seat.price, seat.currency)}. ${status}`;
}

interface SeatButtonProps {
  seat: SeatDto;
  state: ReturnType<typeof seatState>;
  focusable: boolean;
  pending: boolean;
  highlighted: boolean;
  readOnly: boolean;
  onSelect?: (seat: SeatDto) => void;
  onFocusSeat: (seatNumber: string) => void;
}

const SeatButton = memo(function SeatButton({ seat, state, focusable, pending, highlighted, readOnly, onSelect, onFocusSeat }: SeatButtonProps) {
  const selectable = !readOnly && (isSelectable(seat) || state === 'mine');
  return (
    <button
      type="button"
      data-seat={seat.seatNumber}
      className={cx('seat', `seat--${state}`, seat.cabinClass === CabinClass.BUSINESS && 'seat--business', pending && 'seat--pending', highlighted && 'seat--flash')}
      aria-label={seatLabel(seat, state)}
      aria-pressed={state === 'mine'}
      aria-disabled={!selectable || undefined}
      tabIndex={focusable ? 0 : -1}
      title={seatLabel(seat, state)}
      onFocus={() => onFocusSeat(seat.seatNumber)}
      onClick={() => selectable && onSelect?.(seat)}
    >
      <span aria-hidden="true">{state === 'occupied' ? '×' : state === 'mine' ? '✓' : seat.column}</span>
    </button>
  );
});

/**
 * Mapa interactivo de la aeronave (HU2).
 * Accesible: cada asiento es un botón con etiqueta completa; navegación con flechas
 * (roving tabindex), Inicio/Fin por fila; el estado nunca se comunica solo con color (ícono/textura).
 */
export function SeatMap({ map, selectedSeat, pendingSeat, onSelect, readOnly = false, highlight }: SeatMapProps) {
  const layout = useMemo(() => buildCabinLayout(map), [map]);
  const containerRef = useRef<HTMLDivElement>(null);

  const firstSelectable = useMemo(
    () => map.seats.find((s) => s.seatNumber === selectedSeat) ?? map.seats.find(isSelectable) ?? map.seats[0],
    [map.seats, selectedSeat],
  );
  const [focusSeat, setFocusSeat] = useState<string | undefined>(undefined);
  const activeSeat = focusSeat && map.seats.some((s) => s.seatNumber === focusSeat) ? focusSeat : firstSelectable?.seatNumber;

  const moveFocus = useCallback((target: SeatDto | null | undefined) => {
    if (!target) return;
    setFocusSeat(target.seatNumber);
    containerRef.current?.querySelector<HTMLButtonElement>(`[data-seat="${target.seatNumber}"]`)?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!activeSeat) return;
    const rowIdx = layout.rows.findIndex((r) => r.cells.some((c) => c?.seatNumber === activeSeat));
    if (rowIdx < 0) return;
    const row = layout.rows[rowIdx];
    const colIdx = row.cells.findIndex((c) => c?.seatNumber === activeSeat);

    const findInRow = (r: number, from: number, step: number) => {
      const cells = layout.rows[r]?.cells ?? [];
      for (let i = from; i >= 0 && i < cells.length; i += step) if (cells[i]) return cells[i];
      return null;
    };
    const nearestInRow = (r: number) => {
      const cells = layout.rows[r]?.cells;
      if (!cells) return null;
      for (let d = 0; d < cells.length; d++) {
        if (cells[colIdx - d]) return cells[colIdx - d];
        if (cells[colIdx + d]) return cells[colIdx + d];
      }
      return null;
    };

    let target: SeatDto | null = null;
    switch (e.key) {
      case 'ArrowRight':
        target = findInRow(rowIdx, colIdx + 1, 1);
        break;
      case 'ArrowLeft':
        target = findInRow(rowIdx, colIdx - 1, -1);
        break;
      case 'ArrowDown':
        target = nearestInRow(rowIdx + 1);
        break;
      case 'ArrowUp':
        target = nearestInRow(rowIdx - 1);
        break;
      case 'Home':
        target = findInRow(rowIdx, 0, 1);
        break;
      case 'End':
        target = findInRow(rowIdx, row.cells.length - 1, -1);
        break;
      default:
        return;
    }
    e.preventDefault();
    moveFocus(target);
  };

  const gridTemplate = layout.columns
    .map((_, i) => (layout.aisleAfter.includes(i) ? 'var(--seat-size) var(--aisle-size)' : 'var(--seat-size)'))
    .join(' ');

  return (
    <div className="seat-map">
      <div className="seat-map__nose" aria-hidden="true">
        <span>Cabina de mando</span>
      </div>
      <div
        ref={containerRef}
        className="seat-map__grid"
        role="group"
        aria-label={`Mapa de asientos del vuelo ${map.flightNumber}. Use las flechas para moverse y Enter para seleccionar.`}
        onKeyDown={onKeyDown}
      >
        <div className="seat-map__row seat-map__row--header" style={{ gridTemplateColumns: `var(--row-label) ${gridTemplate}` }} aria-hidden="true">
          <span />
          {layout.columns.flatMap((c, i) => {
            const label = (
              <span key={c} className="seat-map__col-label">
                {c}
              </span>
            );
            return layout.aisleAfter.includes(i) ? [label, <span key={`a-${c}`} />] : [label];
          })}
        </div>
        {layout.rows.map((row, idx) => {
          const cabinStart = idx === 0 || layout.rows[idx - 1].cabinClass !== row.cabinClass;
          return (
            <div key={row.row} className="seat-map__section">
              {cabinStart && (
                <p className="seat-map__cabin">
                  {cabinLabel[row.cabinClass]}
                </p>
              )}
              <div className="seat-map__row" style={{ gridTemplateColumns: `var(--row-label) ${gridTemplate}` }}>
                <span className="seat-map__row-label" aria-hidden="true">
                  {row.row}
                </span>
                {row.cells.flatMap((seat, i) => {
                  const cell = seat ? (
                    <SeatButton
                      key={seat.seatNumber}
                      seat={seat}
                      state={seatState(seat, selectedSeat)}
                      focusable={seat.seatNumber === activeSeat}
                      pending={seat.seatNumber === pendingSeat}
                      highlighted={!!highlight?.has(seat.seatNumber)}
                      readOnly={readOnly}
                      onSelect={onSelect}
                      onFocusSeat={setFocusSeat}
                    />
                  ) : (
                    <span key={`empty-${row.row}-${i}`} className="seat seat--none" aria-hidden="true" />
                  );
                  return layout.aisleAfter.includes(i)
                    ? [cell, <span key={`aisle-${row.row}-${i}`} className="seat-map__aisle" aria-hidden="true" />]
                    : [cell];
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SeatLegend() {
  const items: { state: string; label: string; symbol: string }[] = [
    { state: 'available', label: 'Disponible', symbol: 'A' },
    { state: 'mine', label: 'Su selección', symbol: '✓' },
    { state: 'locked', label: 'Bloqueado por otro pasajero', symbol: '' },
    { state: 'occupied', label: 'Ocupado', symbol: '×' },
  ];
  return (
    <ul className="seat-legend" aria-label="Leyenda del mapa de asientos">
      {items.map((i) => (
        <li key={i.state}>
          <span className={cx('seat', 'seat--legend', `seat--${i.state}`)} aria-hidden="true">
            {i.symbol}
          </span>
          {i.label}
        </li>
      ))}
    </ul>
  );
}
