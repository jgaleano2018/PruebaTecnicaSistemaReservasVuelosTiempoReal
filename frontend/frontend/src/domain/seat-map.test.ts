import { describe, expect, it } from 'vitest';
import { SeatReleaseReason, SeatStatus } from '@reservas-vuelos/shared';
import { FLIGHT_ID, seat, seatMap } from '@/test/fixtures';
import { aislePositions, applySeatEvent, buildCabinLayout, isSelectable, replaceSeat, summarize } from './seat-map';

const locked = (seatNumber: string, userId = 'other') => ({
  type: 'locked' as const,
  payload: { flightId: FLIGHT_ID, seatNumber, reservationId: 'r1', userId, price: 1, currency: 'COP', expiresAt: '2030-01-01T00:00:00Z' },
});
const released = (seatNumber: string, reason = SeatReleaseReason.EXPIRED, reservationId = 'r1') => ({
  type: 'released' as const,
  payload: { flightId: FLIGHT_ID, seatNumber, reservationId, reason },
});
const occupied = (seatNumber: string) => ({
  type: 'occupied' as const,
  payload: {
    reservationId: 'r1',
    reservationCode: 'ABC123',
    flightId: FLIGHT_ID,
    flightNumber: 'SA0140',
    seatNumber,
    userId: 'u',
    customerId: 'c',
    paymentId: 'p',
    price: 1,
    currency: 'COP',
    confirmedAt: '2026-01-01T00:00:00Z',
  },
});

describe('applySeatEvent (HU2/HU3 en tiempo real)', () => {
  it('bloquea un asiento disponible y recalcula el resumen', () => {
    const map = seatMap([seat('2A'), seat('2B')]);
    const next = applySeatEvent(map, locked('2A'));
    expect(next.seats[0].status).toBe(SeatStatus.LOCKED);
    expect(next.seats[0].lockExpiresAt).toBe('2030-01-01T00:00:00Z');
    expect(next.summary).toEqual({ total: 2, available: 1, locked: 1, occupied: 0 });
  });

  it('marca lockedByMe cuando el bloqueo es del usuario actual', () => {
    const next = applySeatEvent(seatMap([seat('2A')]), locked('2A', 'me'), 'me');
    expect(next.seats[0].lockedByMe).toBe(true);
    expect(isSelectable(next.seats[0])).toBe(true);
  });

  it('libera un asiento bloqueado (expiración)', () => {
    const map = applySeatEvent(seatMap([seat('2A')]), locked('2A'));
    const next = applySeatEvent(map, released('2A'));
    expect(next.seats[0].status).toBe(SeatStatus.AVAILABLE);
    expect(next.seats[0].lockExpiresAt).toBeNull();
  });

  it('un SeatReleased tardío de otra reserva no libera el nuevo bloqueo', () => {
    let map = applySeatEvent(seatMap([seat('2A')]), locked('2A'));
    map = applySeatEvent(map, { ...locked('2A'), payload: { ...locked('2A').payload, reservationId: 'r2' } });
    map = applySeatEvent(map, released('2A', SeatReleaseReason.EXPIRED, 'r1'));
    expect(map.seats[0].status).toBe(SeatStatus.LOCKED);
    map = applySeatEvent(map, released('2A', SeatReleaseReason.USER_CANCELLED, 'r2'));
    expect(map.seats[0].status).toBe(SeatStatus.AVAILABLE);
  });

  it('un reembolso o la cancelación del vuelo liberan un asiento vendido', () => {
    const sold = applySeatEvent(seatMap([seat('2A'), seat('2B')]), occupied('2A'));
    expect(applySeatEvent(sold, released('2A', SeatReleaseReason.PAYMENT_REFUNDED)).seats[0].status).toBe(SeatStatus.AVAILABLE);
    expect(applySeatEvent(sold, released('2A', SeatReleaseReason.FLIGHT_CANCELLED)).summary.occupied).toBe(0);
  });

  it('ocupa el asiento de forma permanente: eventos tardíos no lo revierten', () => {
    let map = applySeatEvent(seatMap([seat('2A')]), occupied('2A'));
    expect(map.seats[0].status).toBe(SeatStatus.OCCUPIED);
    map = applySeatEvent(map, released('2A'));
    map = applySeatEvent(map, locked('2A'));
    expect(map.seats[0].status).toBe(SeatStatus.OCCUPIED);
    expect(isSelectable(map.seats[0])).toBe(false);
  });

  it('ignora eventos de otros vuelos y devuelve la misma referencia (sin re-render)', () => {
    const map = seatMap([seat('2A')]);
    const other = { ...locked('2A'), payload: { ...locked('2A').payload, flightId: 'OTRO' } };
    expect(applySeatEvent(map, other)).toBe(map);
    expect(applySeatEvent(map, released('2A'))).toBe(map);
  });

  it('acepta el número de asiento en minúscula', () => {
    expect(applySeatEvent(seatMap([seat('12C')]), locked('12c')).seats[0].status).toBe(SeatStatus.LOCKED);
  });
});

describe('distribución de cabina', () => {
  it('calcula pasillos 3-3, 2-2 y 3-3-3', () => {
    expect(aislePositions(6)).toEqual([2]);
    expect(aislePositions(4)).toEqual([1]);
    expect(aislePositions(9)).toEqual([2, 5]);
    expect(aislePositions(3)).toEqual([]);
  });

  it('ordena filas y deja huecos en columnas inexistentes (business A-C-D-F)', () => {
    const layout = buildCabinLayout(seatMap([seat('2B'), seat('1A'), seat('1F'), seat('2A')]));
    expect(layout.columns).toEqual(['A', 'B', 'F']);
    expect(layout.rows.map((r) => r.row)).toEqual([1, 2]);
    expect(layout.rows[0].cells.map((c) => c?.seatNumber ?? null)).toEqual(['1A', null, '1F']);
  });
});

describe('utilidades', () => {
  it('summarize cuenta por estado', () => {
    expect(summarize([seat('1A'), seat('1B', { status: SeatStatus.LOCKED }), seat('1C', { status: SeatStatus.OCCUPIED })])).toEqual({
      total: 3,
      available: 1,
      locked: 1,
      occupied: 1,
    });
  });

  it('replaceSeat sustituye el asiento consultado por REST', () => {
    const map = replaceSeat(seatMap([seat('1A'), seat('1B')]), seat('1B', { status: SeatStatus.OCCUPIED }));
    expect(map.seats[1].status).toBe(SeatStatus.OCCUPIED);
    expect(map.summary.occupied).toBe(1);
  });
});
