import { useState, type FormEvent } from 'react';
import type { CustomerDto } from '@reservas-vuelos/shared';
import { useAuth } from '@/application/auth/auth-context';
import { useMyCustomerProfiles, useUpdateContact } from '@/application/hooks/reservations.hooks';
import { fieldErrorsOf, toUserMessage } from '@/domain/errors';
import { roleLabel } from '@/domain/labels';
import { useToast } from '../components/Toast';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, TextField } from '../components/primitives';

function ContactForm({ customer }: { customer: CustomerDto }) {
  const update = useUpdateContact();
  const toast = useToast();
  const [email, setEmail] = useState(customer.email);
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const contact: { email?: string; phone?: string } = {};
    if (email !== customer.email) contact.email = email;
    if (phone && phone !== customer.phone) contact.phone = phone;
    if (!contact.email && !contact.phone) return;
    try {
      await update.mutateAsync({ customerId: customer.id, contact });
      setErrors({});
      toast.notify({ tone: 'success', title: 'Datos de contacto actualizados' });
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      toast.notify({ tone: 'danger', title: 'No se pudo actualizar', message: toUserMessage(err) });
    }
  };

  return (
    <Card as="article">
      <h2 className="section-title">
        {customer.firstName} {customer.lastName}
      </h2>
      <p className="muted small">
        {customer.documentType} {customer.documentNumber} · {customer.reservationsCount} reservas
      </p>
      <form className="grid-2" onSubmit={submit} noValidate>
        <TextField label="Correo de contacto" type="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Teléfono de contacto" type="tel" value={phone} error={errors.phone} hint="Ej: +573001234567" onChange={(e) => setPhone(e.target.value)} />
        <div className="span-2">
          <Button type="submit" variant="secondary" loading={update.isPending}>
            Guardar contacto
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Módulo de Clientes: perfil del usuario y datos de contacto de los pasajeros registrados. */
export function ProfilePage() {
  const { user } = useAuth();
  const customers = useMyCustomerProfiles();
  return (
    <div className="container page page--narrow">
      <PageHeader eyebrow="Módulo de Clientes" title="Mi perfil" description={user ? `${user.fullName} · ${user.email} · ${roleLabel[user.role]}` : undefined} />
      <h2 className="section-title">Pasajeros asociados</h2>
      {customers.isLoading && <LoadingBlock rows={3} />}
      {customers.isError && <ErrorState error={customers.error} onRetry={() => customers.refetch()} />}
      {customers.data?.length === 0 && (
        <EmptyState title="Sin pasajeros registrados">Al completar su primera compra, los datos del pasajero aparecerán aquí.</EmptyState>
      )}
      <div className="stack">
        {customers.data?.map((c) => (
          <ContactForm key={c.id} customer={c} />
        ))}
      </div>
    </div>
  );
}
