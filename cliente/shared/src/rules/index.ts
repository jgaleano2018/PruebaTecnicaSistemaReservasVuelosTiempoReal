import { FlightStatus } from '../enums';

/** Reglas de negocio compartidas entre servicios (y el frontend, para habilitar/deshabilitar acciones). */

/** Transiciones de estado de vuelo permitidas. */
export const FLIGHT_STATUS_TRANSITIONS: Readonly<Record<FlightStatus, readonly FlightStatus[]>> = {
  [FlightStatus.SCHEDULED]: [FlightStatus.DELAYED, FlightStatus.CANCELLED, FlightStatus.BOARDING, FlightStatus.SOLD_OUT],
  [FlightStatus.DELAYED]: [FlightStatus.DELAYED, FlightStatus.SCHEDULED, FlightStatus.CANCELLED, FlightStatus.BOARDING, FlightStatus.SOLD_OUT],
  [FlightStatus.SOLD_OUT]: [FlightStatus.SCHEDULED, FlightStatus.DELAYED, FlightStatus.CANCELLED, FlightStatus.BOARDING],
  [FlightStatus.BOARDING]: [FlightStatus.DEPARTED, FlightStatus.DELAYED, FlightStatus.CANCELLED],
  [FlightStatus.DEPARTED]: [FlightStatus.ARRIVED],
  [FlightStatus.CANCELLED]: [],
  [FlightStatus.ARRIVED]: [],
};

export function canTransitionFlightStatus(from: FlightStatus, to: FlightStatus): boolean {
  return FLIGHT_STATUS_TRANSITIONS[from].includes(to);
}

/** Estados en los que un vuelo no admite bloqueos ni compras. */
export const NON_BOOKABLE_FLIGHT_STATUSES: readonly FlightStatus[] = [
  FlightStatus.CANCELLED,
  FlightStatus.DEPARTED,
  FlightStatus.ARRIVED,
  FlightStatus.SOLD_OUT,
];

/** Zona horaria de negocio (Colombia, UTC-5, sin horario de verano). */
export const BUSINESS_UTC_OFFSET = '-05:00';

/** Rango [inicio, fin) de un día calendario (YYYY-MM-DD) en la zona horaria de negocio. */
export function businessDayRange(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00${BUSINESS_UTC_OFFSET}`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

/** Fecha YYYY-MM-DD en la zona horaria de negocio. */
export function toBusinessDate(d: Date): string {
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
