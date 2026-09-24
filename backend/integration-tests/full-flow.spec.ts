/**
 * Valida contra el diagrama de arquitectura:
 *  Flujo Principal de Usuario: 1 Busca vuelos -> 2 Selecciona asiento -> 3 Completa datos y paga
 *                              -> 4 Obtiene su boleto -> 5 Monitorea en tiempo real
 *  Flujo de Eventos: Reservation Service -> Kafka -> Realtime Gateway -> Clientes conectados
 * Los cuatro servicios corren en el mismo proceso, con HTTP real entre ellos y un broker en memoria que
 * reemplaza a Kafka (misma interfaz EventBus).
 */
import { AddressInfo } from 'net';
import { createServer, Server } from 'http';
import { io as connect, Socket } from 'socket.io-client';

process.env.LOG_LEVEL = 'silent';

// Monolito modular
import { composeModules, inMemoryInfrastructure } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_Backend/src/container';
import { createHttpApp as monolithApp } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_Backend/src/app';
import { InMemoryBroker, InMemoryEventBus } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_Backend/src/shared/infrastructure/messaging/in-memory-event-bus';
import { buildSeedDataset } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_Backend/src/database/seed/seed-data';
// Payment Service
import { compose as composePayment } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/src/container';
import { createHttpApp as paymentApp } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/src/app';
import { InMemoryEventBus as PsBus } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/src/shared/infrastructure/messaging/in-memory-event-bus';
import * as PsMem from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/src/infrastructure/persistence/in-memory.repositories';
import { FakePaymentGateway } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/src/infrastructure/gateway/fake-payment.gateway';
import { HttpReservationHoldClient } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_PS/src/infrastructure/clients/reservation-hold.client';
// Flight Management Service
import { compose as composeFms } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/src/container';
import { createHttpApp as fmsApp } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/src/app';
import { InMemoryEventBus as FmsBus } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/src/shared/infrastructure/messaging/in-memory-event-bus';
import * as FmsMem from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/src/infrastructure/persistence/in-memory.repositories';
import { HttpMonolithCatalogClient } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_FMS/src/infrastructure/clients/monolith-catalog.client';
// Realtime Gateway
import { RealtimeGatewayService } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/src/application/realtime-gateway.service';
import { attachSocketServer } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/src/infrastructure/websocket/socket-server';
import { createHttpApp as rgApp } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/src/app';
import { buildRoutes as rgRoutes } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/src/infrastructure/http/routes';
import { InMemoryEventBus as RgBus } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/src/shared/infrastructure/messaging/in-memory-event-bus';
import { JwtService } from '../PruebaTecnicaSistemaReservasVuelosTiempoReal_RG/src/shared/infrastructure/auth/jwt';

const SECRET = 'integration-secret-key-123456';
const INTERNAL = 'internal-key';

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

async function http(method: string, url: string, body?: unknown, token?: string) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

function waitFor<T>(socket: Socket, event: string, predicate: (d: T) => boolean = () => true, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), timeout);
    const handler = (d: T) => {
      if (!predicate(d)) return;
      clearTimeout(t);
      socket.off(event, handler);
      resolve(d);
    };
    socket.on(event, handler);
  });
}

describe('Flujo principal de usuario y flujo de eventos (4 servicios)', () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];
  let MONO: string, PAY: string, FMS: string, RG: string;
  let broker: InMemoryBroker;
  let flight: any;

  beforeAll(async () => {
    broker = new InMemoryBroker();

    // ---- Monolito ----
    const infra = inMemoryInfrastructure();
    const data = buildSeedDataset(new Date(), 3);
    flight = data.flights.find((f) => f.routeId === 'BOG-CTG' && f.status === 'SCHEDULED' && f.departureTime.getTime() > Date.now() + 12 * 3600e3)!;
    infra.flights.add(...data.flights.filter((f) => f.routeId === 'BOG-CTG'));
    infra.catalog.airports = data.airports;
    infra.seats.add(...data.seats.filter((s) => s.flightId === flight.id).map((s) => ({ ...s, status: 'AVAILABLE' as any, occupiedByReservationId: null })));
    const mono = composeModules(infra, new InMemoryEventBus('monolith', broker), {
      jwtSecret: SECRET, jwtExpiresIn: '1h', internalApiKey: INTERNAL, seatLockMinutes: 7, maxActiveHoldsPerUser: 4, sweepPeriodMs: 1000,
    });
    const monoServer = createServer(monolithApp(mono, { httpLogs: false }));
    servers.push(monoServer);
    MONO = await listen(monoServer);

    // ---- Payment Service ----
    const ps = composePayment(
      {
        intents: new PsMem.InMemoryPaymentIntentRepository(),
        payments: new PsMem.InMemoryPaymentRepository(),
        refunds: new PsMem.InMemoryRefundRepository(),
        gateway: new FakePaymentGateway(0),
        holds: new HttpReservationHoldClient(MONO),
      },
      new PsBus('payment-service', broker as any),
      { jwtSecret: SECRET, jwtExpiresIn: '1h' },
    );
    const psServer = createServer(paymentApp(ps.router, { httpLogs: false, service: 'payment-service' }));
    servers.push(psServer);
    PAY = await listen(psServer);

    // ---- Flight Management Service ----
    const fms = composeFms(
      {
        flights: new FmsMem.InMemoryManagedFlightRepository(),
        history: new FmsMem.InMemoryStatusHistoryRepository(),
        occupancy: new FmsMem.InMemoryOccupancyRepository(),
        syncLog: new FmsMem.InMemorySyncLogRepository(),
        catalog: new HttpMonolithCatalogClient(MONO, INTERNAL),
      },
      new FmsBus('flight-management-service', broker as any),
      { jwtSecret: SECRET, jwtExpiresIn: '1h', syncDaysAhead: 5 },
    );
    await fms.syncFlights.execute();
    const fmsServer = createServer(fmsApp(fms.router, { httpLogs: false, service: 'fms' }));
    servers.push(fmsServer);
    FMS = await listen(fmsServer);

    // ---- Realtime Gateway ----
    const rgBus = new RgBus('realtime-gateway', broker as any, true);
    const gateway = new RealtimeGatewayService(rgBus.events$, 'rg-test');
    const rgServer = createServer(rgApp(rgRoutes(gateway), {}));
    attachSocketServer(rgServer, gateway, new JwtService(SECRET, '1h'), { corsOrigin: '*', maxSubscriptions: 50 });
    servers.push(rgServer);
    RG = await listen(rgServer);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  });

  const socket = (token?: string) => {
    const s = connect(RG, { transports: ['websocket'], auth: token ? { token } : {}, forceNew: true });
    sockets.push(s);
    return s;
  };
  const subscribe = (s: Socket, event: string, arg?: string) =>
    new Promise<any>((resolve) => (arg === undefined ? s.emit(event, resolve) : s.emit(event, arg, resolve)));

  it('recorre los 5 pasos del flujo con eventos en tiempo real sin double booking', async () => {
    const alice = (await http('POST', `${MONO}/api/v1/auth/register`, { email: 'alice@test.com', password: 'Secret123*', fullName: 'Alice Test' })).body.data;
    const bob = (await http('POST', `${MONO}/api/v1/auth/register`, { email: 'bob@test.com', password: 'Secret123*', fullName: 'Bob Test' })).body.data;
    const admin = new JwtService(SECRET, '1h').sign({ sub: 'admin', email: 'admin@skyandes.com', role: 'ADMIN' as any, name: 'Admin' });

    // Clientes en tiempo real: Bob con el mapa de asientos, un espectador con el dashboard, Alice con su lista de resultados
    const bobSocket = socket(bob.accessToken);
    const dashSocket = socket();
    const aliceSocket = socket(alice.accessToken);
    await subscribe(bobSocket, 'subscribe:flight', flight.id);
    await subscribe(dashSocket, 'subscribe:dashboard', flight.id);
    await subscribe(aliceSocket, 'subscribe:flights');

    // 1. Busca vuelos
    const date = new Date(flight.departureTime.getTime() - 5 * 3600e3).toISOString().slice(0, 10);
    const search = await http('GET', `${MONO}/api/v1/flights/search?origin=BOG&destination=CTG&date=${date}`);
    expect(search.status).toBe(200);
    expect(search.body.data.map((f: any) => f.id)).toContain(flight.id);

    // 2. Selecciona asiento (consulta en el monolito + bloqueo vía Payment Service)
    const seatInfo = await http('GET', `${MONO}/api/v1/flights/${flight.id}/seats/8A`);
    expect(seatInfo.body.data.status).toBe('AVAILABLE');

    const bobSeesLock = waitFor<any>(bobSocket, 'seat:locked', (d) => d.seatNumber === '8A');
    const dashSeesLock = waitFor<any>(dashSocket, 'dashboard:occupancy', (d) => d.locked === 1);
    const checkout = await http('POST', `${PAY}/api/v1/checkout/holds`, { flightId: flight.id, seatNumber: '8A' }, alice.accessToken);
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.paymentIntent.status).toBe('PENDING');
    await broker.drain();
    expect((await bobSeesLock).flightId).toBe(flight.id);
    expect((await dashSeesLock).locked).toBe(1);

    // Bob intenta el mismo asiento: el sistema evita la sobre-reserva
    const conflict = await http('POST', `${PAY}/api/v1/checkout/holds`, { flightId: flight.id, seatNumber: '8A' }, bob.accessToken);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('SEAT_NOT_AVAILABLE');

    // 3. Completa datos y paga (tarjeta rechazada y luego aprobada)
    const passenger = { firstName: 'Alice', lastName: 'Tester', documentType: 'CC', documentNumber: '1037111222', email: 'alice@test.com' };
    const declined = await http('POST', `${PAY}/api/v1/payments`, {
      paymentIntentId: checkout.body.data.paymentIntent.id,
      passenger,
      card: { number: '4000000000000002', holderName: 'ALICE TESTER', expiryMonth: 12, expiryYear: 2030, cvv: '123' },
    }, alice.accessToken);
    expect(declined.status).toBe(402);

    const aliceConfirmed = waitFor<any>(aliceSocket, 'reservation:confirmed');
    const bobSeesOccupied = waitFor<any>(bobSocket, 'seat:occupied', (d) => d.seatNumber === '8A');
    const dashSeesOccupied = waitFor<any>(dashSocket, 'dashboard:occupancy', (d) => d.occupied >= 1 && d.locked === 0);
    const paid = await http('POST', `${PAY}/api/v1/payments`, {
      paymentIntentId: checkout.body.data.paymentIntent.id,
      passenger,
      card: { number: '4111 1111 1111 1111', holderName: 'ALICE TESTER', expiryMonth: 12, expiryYear: 2030, cvv: '123' },
    }, alice.accessToken);
    expect(paid.status).toBe(201);
    expect(paid.body.data).toMatchObject({ status: 'APPROVED', cardLast4: '1111', cardBrand: 'VISA' });
    await broker.drain();

    // 4. Obtiene su boleto (evento global deshabilita el asiento para todos)
    const confirmed = await aliceConfirmed;
    expect(confirmed.reservationCode).toMatch(/^[A-Z2-9]{6}$/);
    expect((await bobSeesOccupied).reservationCode).toBe(confirmed.reservationCode);
    const ticket = await http('GET', `${MONO}/api/v1/tickets/${confirmed.reservationCode}`, undefined, alice.accessToken);
    expect(ticket.body.data).toMatchObject({ status: 'CONFIRMED', seatNumber: '8A', flight: { origin: 'BOG', destination: 'CTG' } });
    const seatAfter = await http('GET', `${MONO}/api/v1/flights/${flight.id}/seats/8A`);
    expect(seatAfter.body.data.status).toBe('OCCUPIED');
    const payment = await http('GET', `${PAY}/api/v1/payments/${paid.body.data.id}`, undefined, alice.accessToken);
    expect(payment.body.data.reservationCode).toBe(confirmed.reservationCode);

    // 5. Monitorea en tiempo real (HU4 en el Flight Management Service)
    await dashSeesOccupied;
    const occupancy = await http('GET', `${FMS}/api/v1/dashboard/flights/${flight.id}/occupancy`);
    expect(occupancy.body.data).toMatchObject({ occupied: 1, locked: 0 });

    // HU1 tiempo real: el administrador retrasa el vuelo y la lista de resultados se actualiza sin recargar
    const aliceSeesStatus = waitFor<any>(aliceSocket, 'flight:status-changed', (d) => d.flightId === flight.id);
    const patch = await http('PATCH', `${FMS}/api/v1/flights/${flight.id}/status`, { status: 'DELAYED', delayMinutes: 45, reason: 'Clima' }, admin);
    expect(patch.status).toBe(200);
    await broker.drain();
    expect((await aliceSeesStatus).newStatus).toBe('DELAYED');
    const refreshed = await http('GET', `${MONO}/api/v1/flights/search?origin=BOG&destination=CTG&date=${date}`);
    expect(refreshed.body.data.find((f: any) => f.id === flight.id)).toMatchObject({ status: 'DELAYED', delayMinutes: 45 });

    // Cancelación: Payment reembolsa automáticamente, el monolito cancela la reserva y libera el asiento
    const bobSeesRelease = waitFor<any>(bobSocket, 'seat:released', (d) => d.seatNumber === '8A' && d.reason === 'PAYMENT_REFUNDED');
    await http('PATCH', `${FMS}/api/v1/flights/${flight.id}/status`, { status: 'CANCELLED', reason: 'Mantenimiento' }, admin);
    await broker.drain();
    await bobSeesRelease;
    const refunded = await http('GET', `${PAY}/api/v1/payments/${paid.body.data.id}`, undefined, alice.accessToken);
    expect(refunded.body.data.status).toBe('REFUNDED');
    expect(refunded.body.data.refunds).toHaveLength(1);
    const reservation = await http('GET', `${MONO}/api/v1/reservations/${confirmed.reservationId}`, undefined, alice.accessToken);
    expect(reservation.body.data.status).toBe('CANCELLED');

    const stats = await http('GET', `${RG}/api/v1/gateway/stats`);
    expect(stats.body.data.connections).toBe(3);
    expect(stats.body.data.dispatches).toBeGreaterThan(5);
  });
});
