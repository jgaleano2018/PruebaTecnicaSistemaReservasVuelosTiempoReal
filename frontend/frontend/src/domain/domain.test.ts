import { describe, expect, it } from 'vitest';
import { CabinClass, FlightStatus } from '@reservas-vuelos/shared';
import { flight } from '@/test/fixtures';
import { AppError, fieldErrorsOf, toUserMessage } from './errors';
import { applyFlightStatusChange, applyOccupancyToFlights, isBookable, lowestFare, sortFlights } from './flights';
import { airportCode, formatCountdown, formatDuration, toIsoDate } from './format';
import { holdDurationMs, holdProgress, holdUrgency, isExpired, remainingMs } from './hold';
import { applyStatusToOccupancy, occupancyShares, totalsOf, upsertOccupancy } from './occupancy';

const occ = (flightId: string, over: object = {}) => ({
  flightId,
  flightNumber: 'SA1',
  origin: 'BOG',
  destination: 'MDE',
  departureTime: '2026-09-25T10:00:00Z',
  status: FlightStatus.SCHEDULED,
  total: 10,
  available: 6,
  locked: 1,
  occupied: 3,
  occupancyRate: 30,
  updatedAt: '2026-09-25T00:00:00Z',
  ...over,
});

describe('vuelos (HU1)', () => {
  it('aplica FlightStatusChanged sin recargar la lista', () => {
    const list = [flight(), flight({ id: 'otro' })];
    const next = applyFlightStatusChange(list, {
      flightId: list[0].id,
      flightNumber: 'SA0140',
      previousStatus: FlightStatus.SCHEDULED,
      newStatus: FlightStatus.DELAYED,
      delayMinutes: 45,
      changedBy: 'admin',
    });
    expect(next[0]).toMatchObject({ status: FlightStatus.DELAYED, delayMinutes: 45 });
    expect(next[1]).toBe(list[1]);
  });

  it('devuelve la misma lista si el vuelo no está en los resultados', () => {
    const list = [flight()];
    expect(
      applyFlightStatusChange(list, { flightId: 'x', flightNumber: 'x', previousStatus: FlightStatus.SCHEDULED, newStatus: FlightStatus.CANCELLED, changedBy: 'a' }),
    ).toBe(list);
  });

  it('actualiza disponibilidad con la ocupación proyectada', () => {
    const [f] = applyOccupancyToFlights([flight()], occ(flight().id, { available: 2, locked: 3, occupied: 5, status: FlightStatus.SOLD_OUT }));
    expect(f.availability).toEqual({ total: 10, available: 2, locked: 3, occupied: 5 });
    expect(f.status).toBe(FlightStatus.SOLD_OUT);
  });

  it('un vuelo cancelado, agotado o sin asientos no es reservable', () => {
    expect(isBookable(flight())).toBe(true);
    expect(isBookable(flight({ status: FlightStatus.CANCELLED }))).toBe(false);
    expect(isBookable(flight({ status: FlightStatus.SOLD_OUT }))).toBe(false);
    expect(isBookable(flight({ availability: { total: 1, available: 0, locked: 1, occupied: 0 } }))).toBe(false);
  });

  it('tarifa mínima por cabina y ordenamiento', () => {
    expect(lowestFare(flight())?.price).toBe(425000);
    expect(lowestFare(flight(), CabinClass.BUSINESS)?.price).toBe(1107000);
    const a = flight({ id: 'a', departureTime: '2026-01-01T10:00:00Z', durationMinutes: 90, fares: [{ cabinClass: CabinClass.ECONOMY, price: 300, currency: 'COP' }] });
    const b = flight({ id: 'b', departureTime: '2026-01-01T08:00:00Z', durationMinutes: 60, fares: [{ cabinClass: CabinClass.ECONOMY, price: 500, currency: 'COP' }] });
    expect(sortFlights([a, b], 'departure').map((f) => f.id)).toEqual(['b', 'a']);
    expect(sortFlights([b, a], 'price').map((f) => f.id)).toEqual(['a', 'b']);
    expect(sortFlights([a, b], 'duration').map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('ocupación (HU4)', () => {
  it('upsert reemplaza el vuelo y descarta proyecciones antiguas', () => {
    const list = [occ('a'), occ('b')];
    const newer = upsertOccupancy(list, occ('a', { locked: 2, updatedAt: '2026-09-25T00:00:01Z' }));
    expect(newer[0].locked).toBe(2);
    expect(upsertOccupancy(newer, occ('a', { locked: 9, updatedAt: '2026-09-24T00:00:00Z' }))).toBe(newer);
    expect(upsertOccupancy(list, occ('zzz'))).toBe(list);
  });

  it('aplica cambios de estado y calcula totales/porcentajes', () => {
    const list = applyStatusToOccupancy([occ('a')], {
      flightId: 'a',
      flightNumber: 'SA1',
      previousStatus: FlightStatus.SCHEDULED,
      newStatus: FlightStatus.CANCELLED,
      changedBy: 'admin',
    });
    expect(list[0].status).toBe(FlightStatus.CANCELLED);
    expect(totalsOf([occ('a'), occ('b')])).toEqual({ total: 20, available: 12, locked: 2, occupied: 6, occupancyRate: 30 });
    const shares = occupancyShares({ total: 10, available: 6, locked: 1, occupied: 3 });
    expect(shares.occupied + shares.locked + shares.available).toBeCloseTo(100);
    expect(occupancyShares({ total: 0, available: 0, locked: 0, occupied: 0 })).toEqual({ occupied: 0, locked: 0, available: 0 });
  });
});

describe('bloqueo temporal', () => {
  const now = Date.parse('2026-09-25T10:00:00Z');
  it('calcula tiempo restante, urgencia y progreso', () => {
    const in3 = new Date(now + 3 * 60_000).toISOString();
    expect(remainingMs(in3, now)).toBe(180_000);
    expect(holdUrgency(180_000)).toBe('calm');
    expect(holdUrgency(90_000)).toBe('warning');
    expect(holdUrgency(30_000)).toBe('critical');
    expect(holdUrgency(0)).toBe('expired');
    expect(isExpired(new Date(now - 1).toISOString(), now)).toBe(true);
    // La duración total se deriva del propio bloqueo (SEAT_LOCK_MINUTES es configurable en el backend: 5-10 min)
    const start = new Date(now).toISOString();
    expect(holdProgress(new Date(now + 5 * 60_000).toISOString(), now, start)).toBe(0);
    expect(holdProgress(new Date(now + 5 * 60_000).toISOString(), now + 150_000, start)).toBeCloseTo(0.5);
    expect(holdDurationMs(new Date(now + 10 * 60_000).toISOString(), start)).toBe(600_000);
  });
});

describe('formato y errores', () => {
  it('formatea tiempos y fechas', () => {
    expect(formatCountdown(125_000)).toBe('02:05');
    expect(formatCountdown(-5)).toBe('00:00');
    expect(formatDuration(85)).toBe('1 h 25 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(airportCode('BOG')).toBe('BOG');
  });

  it('traduce códigos de error del backend a mensajes de usuario', () => {
    expect(toUserMessage(new AppError('x', 'SEAT_NOT_AVAILABLE', 409))).toMatch(/Otro pasajero/);
    expect(toUserMessage(new AppError('Mensaje del servidor', 'OTRO', 400))).toBe('Mensaje del servidor');
    expect(toUserMessage('raro')).toBe('Ocurrió un error inesperado.');
    const err = new AppError('inválido', 'VALIDATION_ERROR', 422, { fieldErrors: { email: ['Correo inválido'] } });
    expect(fieldErrorsOf(err)).toEqual({ email: 'Correo inválido' });
    expect(err.isConflict).toBe(false);
  });
});
