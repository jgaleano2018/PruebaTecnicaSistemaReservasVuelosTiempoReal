import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  SeatReleaseReason,
  type CabinClass,
  type PaymentIntentDto,
  type SeatHoldDto,
  type SeatPosition,
} from '@reservas-vuelos/shared';
import { remainingMs } from '@/domain/hold';
import type { KeyValueStore } from '../ports';
import { useAuth } from '../auth/auth-context';
import { useRealtimeChannel } from '../realtime/use-realtime';
import { useServices } from '../services-context';

export interface CheckoutFlight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
}

export interface CheckoutSeat {
  seatNumber: string;
  cabinClass: CabinClass;
  position: SeatPosition;
}

export interface ActiveCheckout {
  hold: SeatHoldDto;
  paymentIntent: PaymentIntentDto;
  flight: CheckoutFlight;
  seat: CheckoutSeat;
  userId: string;
}

export interface ReleaseNotice {
  seatNumber: string;
  flightNumber: string;
  reason: SeatReleaseReason;
}

interface CheckoutContextValue {
  active: ActiveCheckout | null;
  lastRelease: ReleaseNotice | null;
  /** Bloquea el asiento (Payment Service → Reservas → SeatLocked). Libera antes el bloqueo anterior. */
  holdSeat(flight: CheckoutFlight, seat: CheckoutSeat): Promise<ActiveCheckout>;
  /** Libera el bloqueo actual (→ SeatReleased). */
  releaseHold(): Promise<void>;
  /** Limpia el estado local tras una compra confirmada. */
  complete(): void;
  dismissRelease(): void;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

/** Margen de gracia tras la expiración local antes de descartar el bloqueo si el evento no llega. */
const EXPIRY_GRACE_MS = 10_000;

/**
 * Estado del bloqueo temporal de asiento y la intención de pago (flujo principal pasos 2 y 3).
 * Escucha la sala del vuelo en el gateway para enterarse al instante si el bloqueo expira
 * (barrido del backend → SeatReleased → Kafka → Realtime Gateway).
 */
/** Almacén por defecto en memoria; el composition root inyecta el persistente (sessionStorage). */
function memoryStore<T>(): KeyValueStore<T> {
  let value: T | null = null;
  return { get: () => value, set: (v) => void (value = v), clear: () => void (value = null) };
}

export function CheckoutProvider({
  children,
  store: injectedStore,
}: {
  children: ReactNode;
  store?: KeyValueStore<ActiveCheckout>;
}) {
  const [store] = useState(() => injectedStore ?? memoryStore<ActiveCheckout>());
  const { checkout } = useServices();
  const { user } = useAuth();
  const [active, setActiveState] = useState<ActiveCheckout | null>(() => {
    const saved = store.get();
    return saved && remainingMs(saved.hold.expiresAt) > 0 ? saved : null;
  });
  const [lastRelease, setLastRelease] = useState<ReleaseNotice | null>(null);

  const setActive = useCallback(
    (value: ActiveCheckout | null) => {
      setActiveState(value);
      if (value) store.set(value);
      else store.clear();
    },
    [store],
  );

  // Un bloqueo pertenece al usuario que lo creó: si cambia la sesión, se descarta localmente
  useEffect(() => {
    if (active && active.userId !== user?.id) setActive(null);
  }, [user?.id, active, setActive]);

  const activeRef = useRef(active);
  activeRef.current = active;

  const markReleased = useCallback(
    (reason: SeatReleaseReason) => {
      const current = activeRef.current;
      if (!current) return;
      setLastRelease({ seatNumber: current.hold.seatNumber, flightNumber: current.flight.flightNumber, reason });
      setActive(null);
    },
    [setActive],
  );

  useRealtimeChannel(active ? { kind: 'flight', flightId: active.hold.flightId } : null, {
    'seat:released': (p) => {
      if (active && p.reservationId === active.hold.reservationId) markReleased(p.reason);
    },
    'flight:status-changed': (p) => {
      if (active && p.flightId === active.hold.flightId && p.newStatus === 'CANCELLED') markReleased(SeatReleaseReason.FLIGHT_CANCELLED);
    },
  });

  // Respaldo local si el evento de expiración no llega (p. ej. sin conexión en tiempo real)
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(
      () => markReleased(SeatReleaseReason.EXPIRED),
      remainingMs(active.hold.expiresAt) + EXPIRY_GRACE_MS,
    );
    return () => clearTimeout(timer);
  }, [active, markReleased]);

  const holdSeat = useCallback(
    async (flight: CheckoutFlight, seat: CheckoutSeat) => {
      if (!user) throw new Error('Debe iniciar sesión para reservar');
      if (active && active.hold.flightId === flight.id && active.hold.seatNumber === seat.seatNumber) return active;
      if (active) {
        await checkout.releaseHold(active.hold.reservationId).catch(() => undefined);
        setActive(null);
      }
      const { hold, paymentIntent } = await checkout.createHold(flight.id, seat.seatNumber);
      const next: ActiveCheckout = { hold, paymentIntent, flight, seat, userId: user.id };
      setLastRelease(null);
      setActive(next);
      return next;
    },
    [active, checkout, setActive, user],
  );

  const releaseHold = useCallback(async () => {
    if (!active) return;
    try {
      await checkout.releaseHold(active.hold.reservationId);
    } finally {
      setActive(null);
    }
  }, [active, checkout, setActive]);

  const complete = useCallback(() => setActive(null), [setActive]);
  const dismissRelease = useCallback(() => setLastRelease(null), []);

  const value = useMemo(
    () => ({ active, lastRelease, holdSeat, releaseHold, complete, dismissRelease }),
    [active, lastRelease, holdSeat, releaseHold, complete, dismissRelease],
  );
  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout(): CheckoutContextValue {
  const ctx = useContext(CheckoutContext);
  if (!ctx) throw new Error('useCheckout debe usarse dentro de <CheckoutProvider>');
  return ctx;
}
