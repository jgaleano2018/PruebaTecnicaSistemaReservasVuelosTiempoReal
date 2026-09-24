import { CustomerDto, PassengerDto, ReservationDto } from '@reservas-vuelos/shared';

/** Cliente / pasajero (colección `clientes`). Identidad natural: tipo + número de documento. */
export interface Customer {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone?: string;
  birthDate?: string;
  reservationsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerRepository {
  upsertByDocument(passenger: PassengerDto, userId: string): Promise<Customer>;
  findById(id: string): Promise<Customer | null>;
  findByUserId(userId: string): Promise<Customer[]>;
  list(limit: number, skip: number): Promise<Customer[]>;
  incrementReservations(id: string): Promise<void>;
  updateContact(id: string, contact: { email?: string; phone?: string }): Promise<Customer | null>;
}

/** Puerto hacia el módulo de Reservas: historial de reservas de un cliente. */
export interface ReservationHistoryPort {
  findByCustomer(customerId: string): Promise<ReservationDto[]>;
}

export function toCustomerDto(c: Customer): CustomerDto {
  return {
    id: c.id,
    userId: c.userId,
    firstName: c.firstName,
    lastName: c.lastName,
    documentType: c.documentType,
    documentNumber: c.documentNumber,
    email: c.email,
    phone: c.phone,
    reservationsCount: c.reservationsCount,
  };
}
