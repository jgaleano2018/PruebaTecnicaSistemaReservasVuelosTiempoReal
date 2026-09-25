import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PaymentStatus, ReservationStatus } from '@reservas-vuelos/shared';
import { useMyPayments, useMyReservations, useRefund, useTicketLookup } from '@/application/hooks/reservations.hooks';
import { toUserMessage } from '@/domain/errors';
import { formatDateTime, formatMoney } from '@/domain/format';
import { paymentStatusLabel, reservationStatusLabel } from '@/domain/labels';
import { TicketIcon } from '../components/icons';
import { Tabs } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, TextField } from '../components/primitives';
import { TicketView } from './TicketPage';

function ReservationsTab() {
  const reservations = useMyReservations();
  if (reservations.isLoading) return <LoadingBlock rows={4} />;
  if (reservations.isError) return <ErrorState error={reservations.error} onRetry={() => reservations.refetch()} />;
  const list = [...(reservations.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!list.length)
    return (
      <EmptyState title="Aún no tiene reservas" icon={<TicketIcon size={28} />}>
        <Link to="/">Busque un vuelo</Link> para hacer su primera reserva.
      </EmptyState>
    );
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">Mis reservas</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Asiento</th>
            <th scope="col">Estado</th>
            <th scope="col" className="num">
              Valor
            </th>
            <th scope="col">Creada</th>
            <th scope="col">
              <span className="visually-hidden">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const st = reservationStatusLabel[r.status];
            return (
              <tr key={r.id}>
                <td className="mono">{r.reservationCode ?? '—'}</td>
                <td>{r.seatNumber}</td>
                <td>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </td>
                <td className="num tabular">{formatMoney(r.price, r.currency)}</td>
                <td>{formatDateTime(r.createdAt)}</td>
                <td className="actions">
                  {r.status === ReservationStatus.CONFIRMED && (
                    <Link to={`/reservations/${r.id}/ticket`} className="btn btn--ghost btn--sm">
                      <span>Ver boleto</span>
                    </Link>
                  )}
                  <Link to={`/dashboard/flights/${r.flightId}`} className="btn btn--ghost btn--sm">
                    <span>Vuelo en vivo</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab() {
  const payments = useMyPayments();
  const refund = useRefund();
  const toast = useToast();
  const [confirming, setConfirming] = useState<string | null>(null);

  if (payments.isLoading) return <LoadingBlock rows={4} />;
  if (payments.isError) return <ErrorState error={payments.error} onRetry={() => payments.refetch()} />;
  const list = [...(payments.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!list.length) return <EmptyState title="No hay pagos registrados" />;

  const doRefund = async (paymentId: string) => {
    try {
      await refund.mutateAsync({ paymentId, reason: 'Solicitud del cliente desde la web' });
      toast.notify({ tone: 'success', title: 'Reembolso procesado', message: 'La reserva se cancela y el asiento se libera para otros pasajeros.' });
    } catch (err) {
      toast.notify({ tone: 'danger', title: 'No se pudo reembolsar', message: toUserMessage(err) });
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">Mis pagos</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Asiento</th>
            <th scope="col">Tarjeta</th>
            <th scope="col">Estado</th>
            <th scope="col" className="num">
              Monto
            </th>
            <th scope="col">
              <span className="visually-hidden">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const st = paymentStatusLabel[p.status];
            return (
              <tr key={p.id}>
                <td>{formatDateTime(p.createdAt)}</td>
                <td>{p.seatNumber}</td>
                <td>
                  {p.cardBrand} •••• {p.cardLast4}
                </td>
                <td>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {p.declineReason && <span className="muted small"> {p.declineReason}</span>}
                </td>
                <td className="num tabular">{formatMoney(p.amount, p.currency)}</td>
                <td className="actions">
                  {p.status === PaymentStatus.APPROVED &&
                    (confirming === p.id ? (
                      <span className="inline-confirm">
                        <span className="small">¿Confirmar reembolso?</span>
                        <Button size="sm" variant="danger" loading={refund.isPending} onClick={() => doRefund(p.id)}>
                          Sí, reembolsar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          No
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(p.id)}>
                        Solicitar reembolso
                      </Button>
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TicketLookup() {
  const lookup = useTicketLookup();
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length >= 4) lookup.mutate(code);
  };
  return (
    <div className="stack">
      <form className="inline-form" onSubmit={submit}>
        <TextField label="Código de reserva" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ej: SKY7K2QP" />
        <Button type="submit" loading={lookup.isPending}>
          Buscar boleto
        </Button>
      </form>
      {lookup.isError && <Alert tone="danger">{toUserMessage(lookup.error)}</Alert>}
      {lookup.data && <TicketView ticket={lookup.data} />}
    </div>
  );
}

export function MyTripsPage() {
  const [tab, setTab] = useState('reservations');
  return (
    <div className="container page">
      <PageHeader eyebrow="Módulo de Reservas · Payment Service" title="Mis viajes" description="Sus reservas, boletos, pagos y reembolsos." />
      <Card>
        <Tabs
          label="Secciones de mis viajes"
          active={tab}
          onChange={setTab}
          items={[
            { id: 'reservations', label: 'Reservas' },
            { id: 'payments', label: 'Pagos' },
            { id: 'lookup', label: 'Buscar boleto' },
          ]}
        >
          {tab === 'reservations' && <ReservationsTab />}
          {tab === 'payments' && <PaymentsTab />}
          {tab === 'lookup' && <TicketLookup />}
        </Tabs>
      </Card>
    </div>
  );
}
