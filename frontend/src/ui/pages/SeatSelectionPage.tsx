import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlightStatus, type SeatDto } from '@reservas-vuelos/shared';
import { useAuth } from '@/application/auth/auth-context';
import { canBuy } from '@/application/auth/session';
import { useCheckout } from '@/application/checkout/checkout-context';
import { useFlight } from '@/application/hooks/flights.hooks';
import { useLiveSeatMap, type SeatActivity } from '@/application/hooks/seats.hooks';
import { AppError, toUserMessage } from '@/domain/errors';
import { isBookable } from '@/domain/flights';
import { airportCode, formatDate, formatMoney, formatTime } from '@/domain/format';
import { cabinLabel, flightStatusLabel, releaseReasonLabel, seatPositionLabel } from '@/domain/labels';
import { FlowStepper } from '../components/FlowStepper';
import { HoldTimer } from '../components/HoldTimer';
import { ArrowRightIcon, LockIcon, SeatIcon } from '../components/icons';
import { OccupancyBar } from '../components/Occupancy';
import { LiveBadge } from '../components/Realtime';
import { SeatLegend, SeatMap } from '../components/SeatMap';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock } from '../components/primitives';

const FLASH_MS = 2500;

/** Asientos que cambiaron hace menos de FLASH_MS (resaltado breve en el mapa). */
function useRecentSeats(activity: SeatActivity[]): ReadonlySet<string> {
  const [recent, setRecent] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = activity[0];

  useEffect(() => {
    if (!latest) return;
    setRecent((set) => new Set(set).add(latest.seatNumber));
    timers.current.push(
      setTimeout(() => {
        setRecent((set) => {
          const next = new Set(set);
          next.delete(latest.seatNumber);
          return next;
        });
      }, FLASH_MS),
    );
  }, [latest]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return recent;
}

const ACTIVITY_TEXT: Record<SeatActivity['kind'], (seat: string, mine: boolean) => string> = {
  locked: (s, mine) => (mine ? `Usted bloqueó el asiento ${s}` : `Otro pasajero está comprando el asiento ${s}`),
  released: (s) => `El asiento ${s} volvió a estar disponible`,
  occupied: (s, mine) => (mine ? `Su asiento ${s} quedó confirmado` : `El asiento ${s} fue vendido`),
};

/** Paso 2 del flujo · HU2: selección y bloqueo temporal de asientos en el mapa interactivo. */
export function SeatSelectionPage() {
  const { flightId } = useParams<{ flightId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { active, holdSeat, releaseHold, lastRelease, dismissRelease } = useCheckout();
  const flight = useFlight(flightId);
  const seats = useLiveSeatMap(flightId);
  const [pendingSeat, setPendingSeat] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const highlight = useRecentSeats(seats.activity);

  const myHold = active && active.hold.flightId === flightId ? active : null;
  const selectedSeat = myHold ? seats.data?.seats.find((s) => s.seatNumber === myHold.hold.seatNumber) : undefined;
  const bookable = flight.data ? isBookable(flight.data) || !!myHold : false;
  const allowedToBuy = canBuy(user);

  const onSelect = async (seat: SeatDto) => {
    if (!user) {
      navigate('/login', { state: { from: `/flights/${flightId}` } });
      return;
    }
    if (!allowedToBuy) {
      toast.notify({ tone: 'warning', title: 'Modo espectador', message: 'Su rol solo permite monitorear el vuelo.' });
      return;
    }
    if (!flight.data || pendingSeat) return;
    if (myHold?.hold.seatNumber === seat.seatNumber) return;

    setPendingSeat(seat.seatNumber);
    try {
      await holdSeat(
        {
          id: flight.data.id,
          flightNumber: flight.data.flightNumber,
          origin: airportCode(flight.data.origin),
          destination: airportCode(flight.data.destination),
          departureTime: flight.data.departureTime,
          arrivalTime: flight.data.arrivalTime,
        },
        { seatNumber: seat.seatNumber, cabinClass: seat.cabinClass, position: seat.position },
      );
      toast.notify({ tone: 'success', title: `Asiento ${seat.seatNumber} bloqueado`, message: 'Los demás pasajeros ya lo ven como no disponible.' });
    } catch (err) {
      toast.notify({ tone: 'danger', title: 'No se pudo bloquear el asiento', message: toUserMessage(err) });
      // HU2 · endpoint 1: se re-consulta el asiento para reflejar su estado real
      if (err instanceof AppError && err.isConflict) void seats.refreshSeat(seat.seatNumber).catch(() => undefined);
    } finally {
      setPendingSeat(null);
    }
  };

  const onRelease = async () => {
    setReleasing(true);
    try {
      await releaseHold();
      toast.notify({ tone: 'info', title: 'Asiento liberado' });
    } catch (err) {
      toast.notify({ tone: 'danger', title: 'No se pudo liberar el asiento', message: toUserMessage(err) });
    } finally {
      setReleasing(false);
    }
  };

  if (flight.isLoading || seats.isLoading) {
    return (
      <div className="container page">
        <LoadingBlock label="Cargando mapa de asientos…" rows={6} />
      </div>
    );
  }
  if (flight.isError || seats.isError || !flight.data || !seats.data) {
    return (
      <div className="container page">
        <ErrorState error={flight.error ?? seats.error} onRetry={() => (flight.refetch(), seats.refetch())} />
      </div>
    );
  }

  const f = flight.data;
  const status = flightStatusLabel[f.status];

  return (
    <div className="container page">
      <FlowStepper current={2} />
      <header className="flight-head">
        <div>
          <p className="eyebrow">
            Vuelo {f.flightNumber} · {formatDate(f.departureTime)}
          </p>
          <h1 className="flight-head__title">
            {airportCode(f.origin)} <ArrowRightIcon size={22} /> {airportCode(f.destination)}
          </h1>
          <p className="muted">
            Sale {formatTime(f.departureTime)} · Llega {formatTime(f.arrivalTime)} · {f.aircraft}
          </p>
        </div>
        <div className="flight-head__side">
          <Badge tone={status.tone}>
            {status.label}
            {f.status === FlightStatus.DELAYED && f.delayMinutes ? ` ${f.delayMinutes} min` : ''}
          </Badge>
          <LiveBadge label="Mapa en tiempo real" />
        </div>
      </header>

      {lastRelease && (
        <Alert
          tone="warning"
          title={`Su asiento ${lastRelease.seatNumber} fue liberado`}
          action={
            <Button variant="ghost" size="sm" onClick={dismissRelease}>
              Entendido
            </Button>
          }
        >
          El bloqueo terminó porque {releaseReasonLabel[lastRelease.reason]}. Puede elegir otro asiento.
        </Alert>
      )}
      {!bookable && (
        <Alert tone="warning" title="Este vuelo no admite nuevas reservas">
          Estado actual: {status.label}. El mapa se sigue mostrando en modo consulta.
        </Alert>
      )}
      {user && !allowedToBuy && (
        <Alert tone="info" title="Modo espectador">
          Puede observar los cambios del mapa en tiempo real, pero no reservar.
        </Alert>
      )}

      <div className="seat-layout">
        <Card className="seat-layout__map">
          <div className="seat-layout__map-head">
            <h2 className="section-title">Elija su asiento</h2>
            <SeatLegend />
          </div>
          <SeatMap
            map={seats.data}
            selectedSeat={myHold?.hold.seatNumber}
            pendingSeat={pendingSeat}
            onSelect={onSelect}
            readOnly={!bookable}
            highlight={highlight}
          />
        </Card>

        <aside className="seat-layout__side" aria-label="Resumen de selección">
          <Card>
            <h2 className="section-title">Su selección</h2>
            {myHold ? (
              <div className="selection">
                <div className="selection__seat">
                  <span className="selection__seat-number">{myHold.hold.seatNumber}</span>
                  <div>
                    <p>
                      {cabinLabel[myHold.seat.cabinClass]} · {seatPositionLabel[myHold.seat.position]}
                    </p>
                    <p className="selection__price tabular">{formatMoney(myHold.hold.price, myHold.hold.currency)}</p>
                  </div>
                </div>
                <HoldTimer expiresAt={myHold.hold.expiresAt} startedAt={myHold.paymentIntent.createdAt} />
                <p className="muted small">
                  <LockIcon size={14} /> El asiento está bloqueado para usted. Si no completa el pago antes de que termine el tiempo, se libera automáticamente para los demás pasajeros.
                </p>
                <Link to="/checkout" className="btn btn--primary btn--lg btn--block">
                  <span>Continuar con el pago</span>
                  <ArrowRightIcon size={18} />
                </Link>
                <Button variant="ghost" block onClick={onRelease} loading={releasing}>
                  Liberar asiento
                </Button>
              </div>
            ) : (
              <EmptyState title="Aún no ha elegido asiento" icon={<SeatIcon size={28} />}>
                {user ? 'Seleccione un asiento disponible en el mapa para bloquearlo temporalmente.' : 'Inicie sesión para bloquear un asiento.'}
              </EmptyState>
            )}
            {selectedSeat === undefined && myHold && <p className="muted small">Sincronizando asiento…</p>}
          </Card>

          <Card>
            <h2 className="section-title">Ocupación del vuelo</h2>
            <OccupancyBar counts={seats.data.summary} label={`Vuelo ${f.flightNumber}`} />
          </Card>

          <Card>
            <h2 className="section-title">Actividad en vivo</h2>
            {seats.activity.length === 0 ? (
              <p className="muted small">Aquí verá los asientos que bloquean, liberan o compran otros pasajeros en este momento.</p>
            ) : (
              <ul className="activity" aria-live="polite" aria-label="Actividad reciente del vuelo">
                {seats.activity.slice(0, 8).map((a) => (
                  <li key={a.id} className={`activity__item activity__item--${a.kind}`}>
                    <span className="activity__dot" aria-hidden="true" />
                    <span>{ACTIVITY_TEXT[a.kind](a.seatNumber, a.mine)}</span>
                    <time className="activity__time" dateTime={a.at}>
                      {new Date(a.at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
