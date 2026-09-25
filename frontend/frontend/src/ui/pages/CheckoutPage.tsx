import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BusinessRules, detectCardBrand, PaymentStatus, processPaymentSchema, type PaymentDto } from '@reservas-vuelos/shared';
import { useAuth } from '@/application/auth/auth-context';
import { useCheckout, type ActiveCheckout } from '@/application/checkout/checkout-context';
import { useAwaitConfirmation, useProcessPayment } from '@/application/hooks/reservations.hooks';
import { fieldErrorsOf, toUserMessage } from '@/domain/errors';
import { formatDate, formatMoney, formatTime } from '@/domain/format';
import { cabinLabel, releaseReasonLabel, seatPositionLabel } from '@/domain/labels';
import { formatCardNumber, zodFieldErrors } from '../forms';
import { FlowStepper } from '../components/FlowStepper';
import { HoldTimer } from '../components/HoldTimer';
import { ArrowRightIcon, LockIcon, TicketIcon } from '../components/icons';
import { Alert, Button, Card, EmptyState, SelectField, Spinner, TextField } from '../components/primitives';

interface FormState {
  firstName: string;
  lastName: string;
  documentType: 'CC' | 'CE' | 'PASSPORT' | 'TI';
  documentNumber: string;
  email: string;
  phone: string;
  cardNumber: string;
  holderName: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASSPORT', label: 'Pasaporte' },
  { value: 'TI', label: 'Tarjeta de identidad' },
];

function initialForm(fullName?: string, email?: string): FormState {
  const [firstName = '', ...rest] = (fullName ?? '').split(' ');
  return {
    firstName,
    lastName: rest.join(' '),
    documentType: 'CC',
    documentNumber: '',
    email: email ?? '',
    phone: '',
    cardNumber: '',
    holderName: fullName?.toUpperCase() ?? '',
    expiryMonth: '12',
    expiryYear: String(new Date().getFullYear() + 2),
    cvv: '',
  };
}

/** Mapea los errores anidados de zod ("passenger.firstName", "card.number") a los campos del formulario. */
function mapErrors(errors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, msg] of Object.entries(errors)) {
    const [group, field] = key.split('.');
    if (group === 'card') out[field === 'number' ? 'cardNumber' : field] = msg;
    else out[field ?? group] = msg;
  }
  return out;
}

/** Paso 3 del flujo · HU3: datos del pasajero y pago ficticio; espera la confirmación asíncrona de la reserva. */
export function CheckoutPage() {
  const { user } = useAuth();
  const { active, complete, lastRelease } = useCheckout();
  const navigate = useNavigate();
  const pay = useProcessPayment();
  const [form, setForm] = useState<FormState>(() => initialForm(user?.fullName, user?.email));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [declined, setDeclined] = useState<PaymentDto | null>(null);
  // La compra aprobada conserva su resumen aunque el bloqueo ya no esté activo
  const [approved, setApproved] = useState<{ checkout: ActiveCheckout; payment: PaymentDto } | null>(null);

  const confirmation = useAwaitConfirmation(approved?.checkout.hold.reservationId, !!approved);

  useEffect(() => {
    if (confirmation.status === 'confirmed' && approved) {
      complete();
      navigate(`/reservations/${approved.checkout.hold.reservationId}/ticket`, { replace: true, state: { fresh: true } });
    }
  }, [confirmation.status, approved, complete, navigate]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!active) return;
    setDeclined(null);
    const input = {
      paymentIntentId: active.paymentIntent.id,
      passenger: {
        firstName: form.firstName,
        lastName: form.lastName,
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        email: form.email,
        phone: form.phone || undefined,
      },
      card: {
        number: form.cardNumber,
        holderName: form.holderName,
        expiryMonth: form.expiryMonth,
        expiryYear: form.expiryYear,
        cvv: form.cvv,
      },
    };
    const parsed = processPaymentSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(mapErrors(zodFieldErrors(parsed.error)));
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setErrors({});
    try {
      const payment = await pay.mutateAsync(parsed.data);
      if (payment.status === PaymentStatus.APPROVED) setApproved({ checkout: active, payment });
      else setDeclined(payment);
    } catch (err) {
      setErrors(mapErrors(fieldErrorsOf(err)));
    }
  };

  /* ---------- Pago aprobado: esperando ReservationConfirmed ---------- */
  if (approved) {
    return (
      <div className="container page page--narrow">
        <FlowStepper current={confirmation.status === 'confirmed' ? 4 : 3} />
        <Card className="confirming">
          {confirmation.status === 'failed' ? (
            <Alert tone="danger" title="No fue posible confirmar la reserva">
              {confirmation.reason}
            </Alert>
          ) : confirmation.status === 'timeout' ? (
            <Alert tone="warning" title="La confirmación está tardando más de lo normal">
              Su pago fue aprobado. Consulte el estado en <Link to="/my-trips">Mis viajes</Link> en unos momentos.
            </Alert>
          ) : (
            <div className="confirming__body" role="status" aria-live="polite">
              <Spinner size={40} label="" />
              <h1 className="section-title">Pago aprobado · emitiendo su boleto</h1>
              <p className="muted">
                Autorización {approved.payment.authorizationCode ?? '—'} · {approved.payment.cardBrand} •••• {approved.payment.cardLast4}
              </p>
              <ol className="event-steps" aria-label="Progreso de la confirmación">
                <li className="event-steps__item event-steps__item--done">Pago aprobado por el Payment Service</li>
                <li className={`event-steps__item ${confirmation.status === 'waiting' && confirmation.paymentEvent ? 'event-steps__item--done' : 'event-steps__item--active'}`}>
                  Evento PaymentProcessed distribuido por Kafka
                </li>
                <li className="event-steps__item event-steps__item--active">Reserva confirmada por el Módulo de Reservas (ReservationConfirmed)</li>
              </ol>
            </div>
          )}
        </Card>
      </div>
    );
  }

  /* ---------- Sin bloqueo activo ---------- */
  if (!active) {
    return (
      <div className="container page page--narrow">
        <FlowStepper current={3} />
        {lastRelease ? (
          <Alert tone="warning" title={`El asiento ${lastRelease.seatNumber} ya no está bloqueado para usted`}>
            El bloqueo terminó porque {releaseReasonLabel[lastRelease.reason]}. Vuelva al mapa para elegir otro asiento.
          </Alert>
        ) : (
          <EmptyState title="No tiene un asiento bloqueado" icon={<TicketIcon size={28} />}>
            Busque un vuelo y elija un asiento para continuar con la compra.
          </EmptyState>
        )}
        <div className="center">
          {lastRelease ? (
            <Button onClick={() => navigate(-1)}>Volver al mapa de asientos</Button>
          ) : (
            <Link className="btn btn--primary btn--md" to="/">
              <span>Buscar vuelos</span>
            </Link>
          )}
        </div>
      </div>
    );
  }

  const brand = detectCardBrand(form.cardNumber);
  const years = Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() + i));

  return (
    <div className="container page">
      <FlowStepper current={3} />
      <div className="checkout">
        <form className="checkout__form" onSubmit={submit} noValidate aria-labelledby="checkout-title">
          <h1 id="checkout-title" className="page-header__title">
            Datos del pasajero y pago
          </h1>

          {declined && (
            <Alert tone="danger" title="Pago rechazado" live="assertive">
              {declined.declineReason ?? 'La entidad rechazó la transacción.'} Su asiento sigue bloqueado: puede intentar con otra tarjeta.
            </Alert>
          )}
          {pay.isError && <Alert tone="danger">{toUserMessage(pay.error)}</Alert>}

          <fieldset className="card fieldset">
            <legend className="fieldset__legend">Pasajero</legend>
            <div className="grid-2">
              <TextField label="Nombres" autoComplete="given-name" required value={form.firstName} error={errors.firstName} onChange={(e) => set('firstName', e.target.value)} />
              <TextField label="Apellidos" autoComplete="family-name" required value={form.lastName} error={errors.lastName} onChange={(e) => set('lastName', e.target.value)} />
              <SelectField label="Tipo de documento" required value={form.documentType} options={DOCUMENT_TYPES} onChange={(e) => set('documentType', e.target.value as FormState['documentType'])} />
              <TextField label="Número de documento" required inputMode="numeric" value={form.documentNumber} error={errors.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} />
              <TextField label="Correo electrónico" type="email" autoComplete="email" required value={form.email} error={errors.email} onChange={(e) => set('email', e.target.value)} />
              <TextField label="Teléfono" type="tel" autoComplete="tel" hint="Opcional. Ej: +573001234567" value={form.phone} error={errors.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </fieldset>

          <fieldset className="card fieldset">
            <legend className="fieldset__legend">
              Tarjeta <span className="muted small">(datos ficticios)</span>
            </legend>
            <div className="test-cards">
              <span className="muted small">Tarjetas de prueba:</span>
              <Button variant="secondary" size="sm" onClick={() => set('cardNumber', formatCardNumber(BusinessRules.APPROVED_TEST_CARD))}>
                Aprobada
              </Button>
              <Button variant="secondary" size="sm" onClick={() => set('cardNumber', formatCardNumber(BusinessRules.DECLINED_TEST_CARD))}>
                Rechazada
              </Button>
            </div>
            <div className="grid-2">
              <TextField
                label="Número de tarjeta"
                autoComplete="cc-number"
                inputMode="numeric"
                required
                value={form.cardNumber}
                error={errors.cardNumber}
                hint={form.cardNumber ? `Franquicia: ${brand}` : undefined}
                onChange={(e) => set('cardNumber', formatCardNumber(e.target.value))}
                containerClassName="span-2"
              />
              <TextField label="Nombre en la tarjeta" autoComplete="cc-name" required value={form.holderName} error={errors.holderName} onChange={(e) => set('holderName', e.target.value.toUpperCase())} containerClassName="span-2" />
              <SelectField
                label="Mes de vencimiento"
                autoComplete="cc-exp-month"
                value={form.expiryMonth}
                error={errors.expiryMonth}
                options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1).padStart(2, '0') }))}
                onChange={(e) => set('expiryMonth', e.target.value)}
              />
              <SelectField label="Año de vencimiento" autoComplete="cc-exp-year" value={form.expiryYear} error={errors.expiryYear} options={years.map((y) => ({ value: y, label: y }))} onChange={(e) => set('expiryYear', e.target.value)} />
              <TextField label="CVV" autoComplete="cc-csc" inputMode="numeric" maxLength={4} required value={form.cvv} error={errors.cvv} onChange={(e) => set('cvv', e.target.value.replace(/\D/g, ''))} />
            </div>
          </fieldset>

          <Button type="submit" size="lg" block loading={pay.isPending} icon={<LockIcon size={18} />}>
            Pagar {formatMoney(active.hold.price, active.hold.currency)}
          </Button>
          <p className="muted small center">No se realizan cobros reales. Los datos de la tarjeta no se almacenan completos.</p>
        </form>

        <aside className="checkout__summary" aria-label="Resumen de la compra">
          <Card>
            <h2 className="section-title">Resumen</h2>
            <HoldTimer expiresAt={active.hold.expiresAt} startedAt={active.paymentIntent.createdAt} />
            <dl className="summary-list">
              <div>
                <dt>Vuelo</dt>
                <dd>{active.flight.flightNumber}</dd>
              </div>
              <div>
                <dt>Ruta</dt>
                <dd>
                  {active.flight.origin} <ArrowRightIcon size={14} /> {active.flight.destination}
                </dd>
              </div>
              <div>
                <dt>Salida</dt>
                <dd>
                  {formatDate(active.flight.departureTime)} · {formatTime(active.flight.departureTime)}
                </dd>
              </div>
              <div>
                <dt>Asiento</dt>
                <dd>
                  {active.hold.seatNumber} · {cabinLabel[active.seat.cabinClass]} · {seatPositionLabel[active.seat.position]}
                </dd>
              </div>
              <div className="summary-list__total">
                <dt>Total</dt>
                <dd className="tabular">{formatMoney(active.paymentIntent.amount, active.paymentIntent.currency)}</dd>
              </div>
            </dl>
            <Link to={`/flights/${active.hold.flightId}`} className="btn btn--ghost btn--sm btn--block">
              <span>Cambiar asiento</span>
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
