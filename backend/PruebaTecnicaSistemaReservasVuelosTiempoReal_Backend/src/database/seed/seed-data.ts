import { CabinClass, FlightStatus, ReservationStatus, SeatPosition, SeatStatus, UserRole } from '@reservas-vuelos/shared';
import { Aircraft, Airport, Flight, Route } from '../../modules/flight/domain/flight.entity';
import { generateReservationCode, Reservation, Seat } from '../../modules/reservation/domain/reservation.entities';

/** Datos semilla deterministas (misma semilla => mismos datos) relativos a la fecha de carga. */

export const AIRLINE = 'SkyAndes Airlines';
export const CURRENCY = 'COP';

export const airports: Airport[] = [
  { code: 'BOG', name: 'Aeropuerto Internacional El Dorado', city: 'Bogotá', country: 'Colombia', timezone: 'America/Bogota' },
  { code: 'MDE', name: 'Aeropuerto Internacional José María Córdova', city: 'Rionegro / Medellín', country: 'Colombia', timezone: 'America/Bogota' },
  { code: 'CLO', name: 'Aeropuerto Internacional Alfonso Bonilla Aragón', city: 'Cali', country: 'Colombia', timezone: 'America/Bogota' },
  { code: 'CTG', name: 'Aeropuerto Internacional Rafael Núñez', city: 'Cartagena', country: 'Colombia', timezone: 'America/Bogota' },
  { code: 'BAQ', name: 'Aeropuerto Internacional Ernesto Cortissoz', city: 'Barranquilla', country: 'Colombia', timezone: 'America/Bogota' },
  { code: 'SMR', name: 'Aeropuerto Internacional Simón Bolívar', city: 'Santa Marta', country: 'Colombia', timezone: 'America/Bogota' },
  { code: 'ADZ', name: 'Aeropuerto Internacional Gustavo Rojas Pinilla', city: 'San Andrés', country: 'Colombia', timezone: 'America/Bogota' },
  { code: 'PTY', name: 'Aeropuerto Internacional de Tocumen', city: 'Ciudad de Panamá', country: 'Panamá', timezone: 'America/Panama' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', country: 'Estados Unidos', timezone: 'America/New_York' },
  { code: 'MAD', name: 'Aeropuerto Adolfo Suárez Madrid-Barajas', city: 'Madrid', country: 'España', timezone: 'Europe/Madrid' },
];

const baseRoutes: Array<[string, string, number, number]> = [
  ['BOG', 'MDE', 215, 55],
  ['BOG', 'CLO', 300, 60],
  ['BOG', 'CTG', 660, 85],
  ['BOG', 'BAQ', 700, 90],
  ['BOG', 'SMR', 710, 90],
  ['BOG', 'ADZ', 1200, 125],
  ['MDE', 'CTG', 460, 70],
  ['BOG', 'PTY', 760, 100],
  ['MDE', 'MIA', 2400, 200],
  ['BOG', 'MAD', 8000, 600],
];

export const routes: Route[] = baseRoutes.flatMap(([o, d, km, min]) => [
  { id: `${o}-${d}`, origin: o, destination: d, distanceKm: km, durationMinutes: min },
  { id: `${d}-${o}`, origin: d, destination: o, distanceKm: km, durationMinutes: min },
]);

function layoutSeats(a: Omit<Aircraft, 'totalSeats'>): number {
  return a.layout.reduce((s, l) => s + (l.toRow - l.fromRow + 1) * l.columns.length, 0);
}

const aircraftBase: Omit<Aircraft, 'totalSeats'>[] = [
  {
    id: 'AC-A320-01',
    model: 'Airbus A320',
    registration: 'HK-5001',
    layout: [
      { cabinClass: CabinClass.BUSINESS, fromRow: 1, toRow: 3, columns: ['A', 'C', 'D', 'F'] },
      { cabinClass: CabinClass.ECONOMY, fromRow: 4, toRow: 30, columns: ['A', 'B', 'C', 'D', 'E', 'F'] },
    ],
  },
  {
    id: 'AC-A320N-02',
    model: 'Airbus A320neo',
    registration: 'HK-5002',
    layout: [
      { cabinClass: CabinClass.BUSINESS, fromRow: 1, toRow: 3, columns: ['A', 'C', 'D', 'F'] },
      { cabinClass: CabinClass.ECONOMY, fromRow: 4, toRow: 31, columns: ['A', 'B', 'C', 'D', 'E', 'F'] },
    ],
  },
  {
    id: 'AC-A319-03',
    model: 'Airbus A319',
    registration: 'HK-5003',
    layout: [
      { cabinClass: CabinClass.BUSINESS, fromRow: 1, toRow: 2, columns: ['A', 'C', 'D', 'F'] },
      { cabinClass: CabinClass.ECONOMY, fromRow: 3, toRow: 24, columns: ['A', 'B', 'C', 'D', 'E', 'F'] },
    ],
  },
  {
    id: 'AC-E190-04',
    model: 'Embraer E190',
    registration: 'HK-5004',
    layout: [
      { cabinClass: CabinClass.BUSINESS, fromRow: 1, toRow: 2, columns: ['A', 'C', 'D', 'F'] },
      { cabinClass: CabinClass.ECONOMY, fromRow: 3, toRow: 25, columns: ['A', 'C', 'D', 'F'] },
    ],
  },
  {
    id: 'AC-B788-05',
    model: 'Boeing 787-8 Dreamliner',
    registration: 'N-7801',
    layout: [
      { cabinClass: CabinClass.BUSINESS, fromRow: 1, toRow: 5, columns: ['A', 'D', 'G', 'K'] },
      { cabinClass: CabinClass.ECONOMY, fromRow: 6, toRow: 30, columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K'] },
    ],
  },
];

export const aircraft: Aircraft[] = aircraftBase.map((a) => ({ ...a, totalSeats: layoutSeats(a) }));

export const seedUsers = [
  { email: 'admin@skyandes.com', password: 'Admin123*', fullName: 'Administrador SkyAndes', role: UserRole.ADMIN },
  { email: 'cliente@skyandes.com', password: 'Cliente123*', fullName: 'Cliente Demo', role: UserRole.CUSTOMER },
  { email: 'cliente2@skyandes.com', password: 'Cliente123*', fullName: 'Cliente Demo Dos', role: UserRole.CUSTOMER },
  { email: 'espectador@skyandes.com', password: 'Espectador123*', fullName: 'Espectador Dashboard', role: UserRole.SPECTATOR },
];

export const seedPassengers = [
  { firstName: 'Laura', lastName: 'Gómez', documentType: 'CC' as const, documentNumber: '1037600001', email: 'laura.gomez@example.com', phone: '+573001112233' },
  { firstName: 'Andrés', lastName: 'Restrepo', documentType: 'CC' as const, documentNumber: '1037600002', email: 'andres.restrepo@example.com', phone: '+573002223344' },
  { firstName: 'Camila', lastName: 'Rodríguez', documentType: 'CE' as const, documentNumber: 'E4455667', email: 'camila.rodriguez@example.com' },
  { firstName: 'Santiago', lastName: 'Martínez', documentType: 'PASSPORT' as const, documentNumber: 'PA998877', email: 'santiago.martinez@example.com' },
  { firstName: 'Valentina', lastName: 'López', documentType: 'CC' as const, documentNumber: '1037600005', email: 'valentina.lopez@example.com' },
];

/** PRNG determinista (mulberry32). */
export function prng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roundTo = (n: number, step = 1000) => Math.round(n / step) * step;

function positionOf(column: string, columns: string[]): SeatPosition {
  const first = columns[0];
  const last = columns[columns.length - 1];
  if (column === first || column === last) return SeatPosition.WINDOW;
  if (columns.length === 4) return SeatPosition.AISLE;
  if (columns.length === 6) return ['C', 'D'].includes(column) ? SeatPosition.AISLE : SeatPosition.MIDDLE;
  // 3-3-3 (B787)
  return ['C', 'D', 'F', 'G'].includes(column) ? SeatPosition.AISLE : SeatPosition.MIDDLE;
}

const SURCHARGE: Record<SeatPosition, number> = {
  [SeatPosition.WINDOW]: 25000,
  [SeatPosition.AISLE]: 15000,
  [SeatPosition.MIDDLE]: 0,
};

export function buildSeats(flight: Flight, plane: Aircraft): Seat[] {
  const seats: Seat[] = [];
  for (const section of plane.layout) {
    const fare = flight.fares.find((f) => f.cabinClass === section.cabinClass)!;
    for (let row = section.fromRow; row <= section.toRow; row++) {
      for (const column of section.columns) {
        const position = positionOf(column, section.columns);
        seats.push({
          flightId: flight.id,
          seatNumber: `${row}${column}`,
          row,
          column,
          cabinClass: section.cabinClass,
          position,
          price: section.cabinClass === CabinClass.BUSINESS ? fare.price : fare.price + SURCHARGE[position],
          currency: CURRENCY,
          status: SeatStatus.AVAILABLE,
          lockedByReservationId: null,
          lockedByUserId: null,
          lockExpiresAt: null,
          occupiedByReservationId: null,
        });
      }
    }
  }
  return seats;
}

function aircraftForRoute(distanceKm: number, idx: number): Aircraft {
  if (distanceKm > 5000) return aircraft[4];
  if (distanceKm > 1500) return aircraft[1];
  return [aircraft[0], aircraft[2], aircraft[3], aircraft[1]][idx % 4];
}

/** Horarios de salida (hora local Colombia) por índice de ruta. */
const DEPARTURE_SLOTS = [
  ['06:00', '13:30', '19:15'],
  ['07:10', '17:40'],
  ['08:25', '15:50'],
  ['09:05', '18:30'],
  ['10:45'],
  ['11:20'],
  ['06:40', '16:10'],
  ['12:15'],
  ['14:00'],
  ['21:30'],
];

export interface SeedDataset {
  airports: Airport[];
  routes: Route[];
  aircraft: Aircraft[];
  flights: Flight[];
  seats: Seat[];
  reservations: Omit<Reservation, 'userId' | 'customerId'>[];
  /** índice de pasajero semilla asociado a cada reserva */
  reservationPassenger: number[];
}

function localDateParts(d: Date): string {
  const bogota = new Date(d.getTime() - 5 * 3600 * 1000);
  return bogota.toISOString().slice(0, 10);
}

export function buildSeedDataset(now = new Date(), days = 10, seed = 20260924): SeedDataset {
  const rand = prng(seed);
  const flights: Flight[] = [];
  const seats: Seat[] = [];
  const reservations: SeedDataset['reservations'] = [];
  const reservationPassenger: number[] = [];
  const today = localDateParts(now);
  const usedCodes = new Set<string>();

  routes.forEach((route, routeIdx) => {
    const pairIdx = Math.floor(routeIdx / 2);
    const slots = DEPARTURE_SLOTS[pairIdx];
    const economy = roundTo(route.distanceKm * 380 + 120000);
    const business = roundTo(economy * 2.6);

    for (let day = 0; day < days; day++) {
      const date = new Date(`${today}T00:00:00-05:00`);
      date.setUTCDate(date.getUTCDate() + day);
      const ymd = localDateParts(new Date(date.getTime() + 5 * 3600 * 1000));

      slots.forEach((slot, slotIdx) => {
        const flightNumber = `SA${String(100 + pairIdx * 20 + (routeIdx % 2) * 10 + slotIdx).padStart(4, '0')}`;
        const departureTime = new Date(`${ymd}T${slot}:00-05:00`);
        const plane = aircraftForRoute(route.distanceKm, routeIdx + slotIdx);
        // Variación de tarifa por día/horario (demanda simulada)
        const factor = 0.85 + rand() * 0.5;
        const flight: Flight = {
          id: `${flightNumber}-${ymd.replace(/-/g, '')}`,
          flightNumber,
          airline: AIRLINE,
          originCode: route.origin,
          destinationCode: route.destination,
          routeId: route.id,
          aircraftId: plane.id,
          aircraftModel: plane.model,
          departureTime,
          arrivalTime: new Date(departureTime.getTime() + route.durationMinutes * 60000),
          durationMinutes: route.durationMinutes,
          status: FlightStatus.SCHEDULED,
          fares: [
            { cabinClass: CabinClass.ECONOMY, price: roundTo(economy * factor), currency: CURRENCY },
            { cabinClass: CabinClass.BUSINESS, price: roundTo(business * factor), currency: CURRENCY },
          ],
        };
        if (departureTime.getTime() < now.getTime()) flight.status = FlightStatus.DEPARTED;
        // Algunos estados especiales para la demo (HU1: cancelado / retrasado)
        const r = rand();
        if (flight.status === FlightStatus.SCHEDULED && r < 0.03) flight.status = FlightStatus.CANCELLED;
        else if (flight.status === FlightStatus.SCHEDULED && r < 0.1) {
          flight.status = FlightStatus.DELAYED;
          flight.delayMinutes = 30 + Math.floor(rand() * 6) * 15;
        }
        flights.push(flight);

        const flightSeats = buildSeats(flight, plane);
        // Ocupación inicial realista (10% - 45%) con reservas confirmadas asociadas
        const occupancy = flight.status === FlightStatus.CANCELLED ? 0 : 0.1 + rand() * 0.35;
        for (const seat of flightSeats) {
          if (rand() >= occupancy) continue;
          const reservationId = `seed${flight.id.replace(/-/g, '')}${seat.seatNumber}`.slice(0, 40);
          let code = generateReservationCode(rand);
          while (usedCodes.has(code)) code = generateReservationCode(rand);
          usedCodes.add(code);
          seat.status = SeatStatus.OCCUPIED;
          seat.occupiedByReservationId = reservationId;
          const createdAt = new Date(now.getTime() - Math.floor(rand() * 20) * 24 * 3600 * 1000 - 3600 * 1000);
          reservations.push({
            id: reservationId,
            reservationCode: code,
            flightId: flight.id,
            flightNumber,
            seatNumber: seat.seatNumber,
            cabinClass: seat.cabinClass,
            status: ReservationStatus.CONFIRMED,
            price: seat.price,
            currency: seat.currency,
            holdExpiresAt: new Date(createdAt.getTime() + 7 * 60000),
            paymentId: `seed-payment-${reservationId}`,
            createdAt,
            confirmedAt: new Date(createdAt.getTime() + 3 * 60000),
          });
          reservationPassenger.push(Math.floor(rand() * seedPassengers.length));
        }
        seats.push(...flightSeats);
      });
    }
  });

  return { airports, routes, aircraft, flights, seats, reservations, reservationPassenger };
}
