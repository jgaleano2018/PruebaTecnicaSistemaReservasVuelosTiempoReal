import { JwtService } from '../../shared/infrastructure/auth/jwt';
import { CustomerQueries, CustomerRegistryService } from './application/customer.use-cases';
import { CustomerRepository, ReservationHistoryPort } from './domain/customer';
import { buildCustomerRouter } from './infrastructure/http/customer.routes';

/** Módulo de Clientes (Customer): gestión de pasajeros, perfiles, historial de reservas y datos de contacto. */
export function createCustomerModule(d: { customers: CustomerRepository; history: ReservationHistoryPort; jwt: JwtService }) {
  return {
    router: buildCustomerRouter(d.jwt, new CustomerQueries(d.customers, d.history)),
    api: { registry: new CustomerRegistryService(d.customers) },
  };
}
