/**
 * Script de inicialización de MongoDB (se ejecuta una sola vez al crear el volumen).
 * Crea las 3 bases de datos del diagrama con sus colecciones y validadores $jsonSchema:
 *   - reservas_vuelos_db (Monolito Modular): vuelos, aeropuertos, rutas, aviones, reservas, clientes, asientos, usuarios
 *   - flight-db (Flight Management Service): vuelos_gestion, ocupacion_vuelos, historial_estados, sincronizaciones
 *   - payment-db (Payment Service): intenciones_pago, pagos, reembolsos
 * Los índices los gestiona Mongoose (syncIndexes) y la carga inicial de documentos la hace el
 * seeder del monolito (fechas relativas al día de despliegue).
 */
const FLIGHT_STATUS = ['SCHEDULED', 'BOARDING', 'DELAYED', 'CANCELLED', 'SOLD_OUT', 'DEPARTED', 'ARRIVED'];
const SEAT_STATUS = ['AVAILABLE', 'LOCKED', 'OCCUPIED'];
const RESERVATION_STATUS = ['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'FAILED'];
const PAYMENT_STATUS = ['PENDING', 'PROCESSING', 'APPROVED', 'DECLINED', 'REFUNDED', 'EXPIRED', 'CANCELLED'];

function create(dbName, name, required, properties) {
  const target = db.getSiblingDB(dbName);
  if (target.getCollectionNames().includes(name)) return;
  target.createCollection(name, {
    validator: { $jsonSchema: { bsonType: 'object', required, properties } },
    validationLevel: 'moderate',
    validationAction: 'error',
  });
  print(`[mongo-init] ${dbName}.${name} creada`);
}

// ---------------- Monolito modular ----------------
const M = 'reservas_vuelos_db';
create(M, 'aeropuertos', ['_id', 'name', 'city', 'country'], {
  _id: { bsonType: 'string', pattern: '^[A-Z]{3}$', description: 'Código IATA' },
  name: { bsonType: 'string' },
  city: { bsonType: 'string' },
  country: { bsonType: 'string' },
});
create(M, 'rutas', ['_id', 'origin', 'destination', 'distanceKm'], {
  origin: { bsonType: 'string' },
  destination: { bsonType: 'string' },
  distanceKm: { bsonType: ['int', 'long', 'double'], minimum: 1 },
});
create(M, 'aviones', ['_id', 'model', 'registration', 'totalSeats'], {
  model: { bsonType: 'string' },
  registration: { bsonType: 'string' },
  totalSeats: { bsonType: ['int', 'long', 'double'], minimum: 1 },
});
create(M, 'vuelos', ['_id', 'flightNumber', 'originCode', 'destinationCode', 'departureTime', 'arrivalTime', 'status', 'fares'], {
  departureTime: { bsonType: 'date' },
  arrivalTime: { bsonType: 'date' },
  status: { enum: FLIGHT_STATUS },
  fares: { bsonType: 'array', minItems: 1 },
});
create(M, 'asientos', ['flightId', 'seatNumber', 'status', 'price', 'cabinClass'], {
  seatNumber: { bsonType: 'string', pattern: '^[0-9]{1,2}[A-K]$' },
  status: { enum: SEAT_STATUS },
  price: { bsonType: ['int', 'long', 'double'], minimum: 0 },
});
create(M, 'reservas', ['_id', 'flightId', 'seatNumber', 'userId', 'status', 'price', 'holdExpiresAt'], {
  status: { enum: RESERVATION_STATUS },
  reservationCode: { bsonType: 'string', pattern: '^[A-Z2-9]{6}$' },
  holdExpiresAt: { bsonType: 'date' },
});
create(M, 'clientes', ['_id', 'documentType', 'documentNumber', 'email', 'firstName', 'lastName'], {
  documentType: { enum: ['CC', 'CE', 'PASSPORT', 'TI'] },
  email: { bsonType: 'string' },
});
create(M, 'usuarios', ['_id', 'email', 'passwordHash', 'role'], {
  role: { enum: ['CUSTOMER', 'ADMIN', 'SPECTATOR'] },
});

// ---------------- Flight Management Service ----------------
const F = 'flight-db';
create(F, 'vuelos_gestion', ['_id', 'flightNumber', 'origin', 'destination', 'departureTime', 'status'], {
  status: { enum: FLIGHT_STATUS },
  departureTime: { bsonType: 'date' },
});
create(F, 'ocupacion_vuelos', ['_id', 'seats'], { seats: { bsonType: 'object' } });
create(F, 'historial_estados', ['flightId', 'newStatus', 'changedAt'], {
  newStatus: { enum: FLIGHT_STATUS },
  changedAt: { bsonType: 'date' },
});
create(F, 'sincronizaciones', ['type', 'at'], { type: { enum: ['CATALOG', 'AIRLINE'] } });

// ---------------- Payment Service ----------------
const P = 'payment-db';
create(P, 'intenciones_pago', ['_id', 'reservationId', 'userId', 'amount', 'status', 'expiresAt'], {
  status: { enum: PAYMENT_STATUS },
  amount: { bsonType: ['int', 'long', 'double'], minimum: 0 },
});
create(P, 'pagos', ['_id', 'reservationId', 'amount', 'status', 'cardLast4'], {
  status: { enum: PAYMENT_STATUS },
  cardLast4: { bsonType: 'string', pattern: '^[0-9]{4}$' },
});
create(P, 'reembolsos', ['_id', 'paymentId', 'amount', 'reason'], {});
