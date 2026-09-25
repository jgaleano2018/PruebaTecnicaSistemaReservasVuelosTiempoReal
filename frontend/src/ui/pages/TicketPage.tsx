import { Link, useLocation, useParams } from 'react-router-dom';
import type { TicketDto } from '@reservas-vuelos/shared';
import { useTicket } from '@/application/hooks/reservations.hooks';
import { formatDate, formatDateTime, formatMoney, formatTime } from '@/domain/format';
import { cabinLabel, reservationStatusLabel } from '@/domain/labels';
import { FlowStepper } from '../components/FlowStepper';
import { ChartIcon, PlaneIcon } from '../components/icons';
import { Alert, Badge, Button, ErrorState, LoadingBlock } from '../components/primitives';

/** Barras decorativas deterministas derivadas del código de reserva. */
function barcodeBars(code: string, count = 56): number[] {
  let h = 7;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    h = (h * 1103515245 + 12345 + i) >>> 0;
    return (h % 3) + 1;
  });
}

export function TicketView({ ticket }: { ticket: TicketDto }) {
  const status = reservationStatusLabel[ticket.status];
  return (
    <article className="ticket" aria-labelledby="ticket-code">
      <header className="ticket__head">
        <div>
          <p className="eyebrow">Código de reserva</p>
          <p id="ticket-code" className="ticket__code">
            {ticket.reservationCode}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      <div className="ticket__route">
        <div>
          <p className="ticket__iata">{ticket.flight.origin}</p>
          <p className="muted">{formatTime(ticket.flight.departureTime)}</p>
        </div>
        <div className="ticket__plane" aria-hidden="true">
          <span />
          <PlaneIcon size={22} />
          <span />
        </div>
        <div className="ticket__end">
          <p className="ticket__iata">{ticket.flight.destination}</p>
          <p className="muted">{formatTime(ticket.flight.arrivalTime)}</p>
        </div>
      </div>

      <dl className="ticket__grid">
        <div>
          <dt>Pasajero</dt>
          <dd>{ticket.passenger ? `${ticket.passenger.firstName} ${ticket.passenger.lastName}` : '—'}</dd>
        </div>
        <div>
          <dt>Vuelo</dt>
          <dd>{ticket.flight.flightNumber}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{formatDate(ticket.flight.departureTime)}</dd>
        </div>
        <div>
          <dt>Asiento</dt>
          <dd className="ticket__seat">{ticket.seatNumber}</dd>
        </div>
        <div>
          <dt>Cabina</dt>
          <dd>{cabinLabel[ticket.cabinClass]}</dd>
        </div>
        <div>
          <dt>Total pagado</dt>
          <dd className="tabular">{formatMoney(ticket.price, ticket.currency)}</dd>
        </div>
        {ticket.passenger && (
          <div>
            <dt>Documento</dt>
            <dd>
              {ticket.passenger.documentType} {ticket.passenger.documentNumber}
            </dd>
          </div>
        )}
        {ticket.confirmedAt && (
          <div>
            <dt>Emitido</dt>
            <dd>{formatDateTime(ticket.confirmedAt)}</dd>
          </div>
        )}
      </dl>
      <div className="ticket__barcode" aria-hidden="true">
        {barcodeBars(ticket.reservationCode).map((w, i) => (
          <span key={i} style={{ width: `${w}px`, marginRight: `${(i * 7) % 3 + 1}px` }} />
        ))}
      </div>
    </article>
  );
}

/** Paso 4 del flujo · HU3: boleto con código de reserva único. */
export function TicketPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const location = useLocation();
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh;
  const ticket = useTicket(reservationId);

  return (
    <div className="container page page--narrow">
      {fresh && <FlowStepper current={4} />}
      {fresh && (
        <Alert tone="success" title="¡Reserva confirmada!">
          Su asiento quedó ocupado de forma permanente y ya no está disponible para otros pasajeros.
        </Alert>
      )}
      {ticket.isLoading && <LoadingBlock label="Cargando boleto…" rows={5} />}
      {ticket.isError && <ErrorState error={ticket.error} onRetry={() => ticket.refetch()} />}
      {ticket.data && <TicketView ticket={ticket.data} />}
      <div className="ticket-actions">
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimir boleto
        </Button>
        {ticket.data && (
          <Link className="btn btn--secondary btn--md" to={`/dashboard/flights/${ticket.data.flight.id}`}>
            <ChartIcon size={18} />
            <span>Monitorear el vuelo en vivo</span>
          </Link>
        )}
        <Link className="btn btn--ghost btn--md" to="/my-trips">
          <span>Ir a mis viajes</span>
        </Link>
      </div>
    </div>
  );
}
