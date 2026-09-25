import { CustomerDto, PassengerDto, ReservationDto, UserRole } from '@reservas-vuelos/shared';
import { ForbiddenError, NotFoundError } from '@reservas-vuelos/service-kernel';
import { CustomerRegistryPort } from '../../reservation/domain/reservation.ports';
import { Customer, CustomerRepository, ReservationHistoryPort, toCustomerDto } from '../domain/customer';

interface Requester {
  sub: string;
  role: UserRole;
}

/** Implementa el puerto que consume el módulo de Reservas al confirmar (gestión de pasajeros). */
export class CustomerRegistryService implements CustomerRegistryPort {
  constructor(private readonly customers: CustomerRepository) {}

  async registerPassenger(passenger: PassengerDto, userId: string): Promise<{ customerId: string }> {
    const c = await this.customers.upsertByDocument(passenger, userId);
    return { customerId: c.id };
  }

  incrementReservations(customerId: string): Promise<void> {
    return this.customers.incrementReservations(customerId);
  }
}

export class CustomerQueries {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly history: ReservationHistoryPort,
  ) {}

  private async getOwned(id: string, requester: Requester): Promise<Customer> {
    const c = await this.customers.findById(id);
    if (!c) throw new NotFoundError('Cliente', id);
    if (requester.role !== UserRole.ADMIN && c.userId !== requester.sub) throw new ForbiddenError();
    return c;
  }

  async mine(userId: string): Promise<CustomerDto[]> {
    return (await this.customers.findByUserId(userId)).map(toCustomerDto);
  }

  async byId(id: string, requester: Requester): Promise<CustomerDto> {
    return toCustomerDto(await this.getOwned(id, requester));
  }

  async list(limit = 50, skip = 0): Promise<CustomerDto[]> {
    return (await this.customers.list(limit, skip)).map(toCustomerDto);
  }

  /** Historial de reservas del cliente. */
  async reservations(id: string, requester: Requester): Promise<ReservationDto[]> {
    await this.getOwned(id, requester);
    return this.history.findByCustomer(id);
  }

  async updateContact(id: string, contact: { email?: string; phone?: string }, requester: Requester): Promise<CustomerDto> {
    await this.getOwned(id, requester);
    const updated = await this.customers.updateContact(id, contact);
    if (!updated) throw new NotFoundError('Cliente', id);
    return toCustomerDto(updated);
  }
}
