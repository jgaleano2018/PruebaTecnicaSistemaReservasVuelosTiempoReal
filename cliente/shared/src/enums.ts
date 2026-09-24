/** Estados de un vuelo (Historia de Usuario 1 y 4). */
export enum FlightStatus {
  SCHEDULED = 'SCHEDULED',
  BOARDING = 'BOARDING',
  DELAYED = 'DELAYED',
  CANCELLED = 'CANCELLED',
  SOLD_OUT = 'SOLD_OUT',
  DEPARTED = 'DEPARTED',
  ARRIVED = 'ARRIVED',
}

/** Estados de un asiento en el mapa interactivo (Historia de Usuario 2 y 3). */
export enum SeatStatus {
  AVAILABLE = 'AVAILABLE',
  LOCKED = 'LOCKED',
  OCCUPIED = 'OCCUPIED',
}

export enum CabinClass {
  BUSINESS = 'BUSINESS',
  ECONOMY = 'ECONOMY',
}

export enum SeatPosition {
  WINDOW = 'WINDOW',
  MIDDLE = 'MIDDLE',
  AISLE = 'AISLE',
}

export enum ReservationStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

export enum SeatReleaseReason {
  EXPIRED = 'EXPIRED',
  USER_CANCELLED = 'USER_CANCELLED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  FLIGHT_CANCELLED = 'FLIGHT_CANCELLED',
}

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  SPECTATOR = 'SPECTATOR',
}
