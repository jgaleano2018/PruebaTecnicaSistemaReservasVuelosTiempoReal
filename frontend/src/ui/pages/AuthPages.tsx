import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, registerSchema, UserRole } from '@reservas-vuelos/shared';
import { useAuth } from '@/application/auth/auth-context';
import { fieldErrorsOf, toUserMessage } from '@/domain/errors';
import { zodFieldErrors } from '../forms';
import { PlaneIcon } from '../components/icons';
import { Alert, Button, TextField } from '../components/primitives';

const DEMO_USERS = [
  { label: 'Cliente', email: 'cliente@skyandes.com', password: 'Cliente123*' },
  { label: 'Administrador', email: 'admin@skyandes.com', password: 'Admin123*' },
  { label: 'Espectador', email: 'espectador@skyandes.com', password: 'Espectador123*' },
];

function useRedirectAfterAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (role: UserRole) => navigate(from && from !== '/login' ? from : role === UserRole.SPECTATOR ? '/dashboard' : '/', { replace: true });
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__aside" aria-hidden="true">
        <div className="auth__aside-inner">
          <PlaneIcon size={36} />
          <p className="auth__quote">Reserve su asiento y véalo actualizarse en tiempo real para todos los pasajeros.</p>
        </div>
      </div>
      <div className="auth__panel">
        <h1 className="auth__title">{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const redirect = useRedirectAfterAuth();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    try {
      const user = await login(parsed.data);
      redirect(user.role);
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      setFormError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Iniciar sesión" subtitle="Acceda para reservar asientos, pagar y consultar sus boletos.">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <form className="form" onSubmit={submit} noValidate>
        <TextField
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          error={errors.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={values.password}
          error={errors.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
        />
        <Button type="submit" size="lg" block loading={loading}>
          Ingresar
        </Button>
      </form>
      <div className="demo-users">
        <p className="demo-users__title">Usuarios de prueba</p>
        <div className="demo-users__list">
          {DEMO_USERS.map((u) => (
            <Button key={u.email} variant="secondary" size="sm" onClick={() => setValues({ email: u.email, password: u.password })}>
              {u.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="auth__switch">
        ¿No tiene cuenta? <Link to="/register">Regístrese</Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const redirect = useRedirectAfterAuth();
  const [values, setValues] = useState({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    try {
      const user = await register(parsed.data);
      redirect(user.role);
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      setFormError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Crear cuenta" subtitle="Las cuentas nuevas se crean con rol Cliente.">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <form className="form" onSubmit={submit} noValidate>
        <TextField label="Nombre completo" autoComplete="name" required value={values.fullName} error={errors.fullName} onChange={(e) => setValues({ ...values, fullName: e.target.value })} />
        <TextField label="Correo electrónico" type="email" autoComplete="email" required value={values.email} error={errors.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          required
          hint="Mínimo 6 caracteres"
          value={values.password}
          error={errors.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
        />
        <Button type="submit" size="lg" block loading={loading}>
          Crear cuenta
        </Button>
      </form>
      <p className="auth__switch">
        ¿Ya tiene cuenta? <Link to="/login">Inicie sesión</Link>
      </p>
    </AuthShell>
  );
}
