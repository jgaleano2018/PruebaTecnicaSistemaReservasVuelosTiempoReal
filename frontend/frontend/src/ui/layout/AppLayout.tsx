import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserRole } from '@reservas-vuelos/shared';
import { useAuth } from '@/application/auth/auth-context';
import { useCheckout } from '@/application/checkout/checkout-context';
import { useResyncOnReconnect } from '@/application/realtime/use-realtime';
import { roleLabel } from '@/domain/labels';
import { HoldTimer } from '../components/HoldTimer';
import { MoonIcon, PlaneIcon, SunIcon } from '../components/icons';
import { ConnectionIndicator } from '../components/Realtime';
import { Button, cx } from '../components/primitives';

type Theme = 'light' | 'dark' | 'system';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('skyandes.theme') as Theme) ?? 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('skyandes.theme', theme);
    } catch {
      // sin almacenamiento
    }
  }, [theme]);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return [theme, () => setTheme(isDark ? 'light' : 'dark')];
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { active } = useCheckout();
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  useResyncOnReconnect();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const showHoldBanner = active && !location.pathname.startsWith('/checkout') && !location.pathname.startsWith(`/flights/${active.hold.flightId}`);

  const links = [
    { to: '/', label: 'Buscar vuelos', end: true, show: true },
    { to: '/my-trips', label: 'Mis viajes', show: !!user },
    { to: '/dashboard', label: 'Dashboard en vivo', show: true },
    { to: '/admin', label: 'Administración', show: user?.role === UserRole.ADMIN },
  ];

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="app-header">
        <div className="container app-header__inner">
          <Link to="/" className="brand" aria-label="SkyAndes, inicio">
            <span className="brand__mark" aria-hidden="true">
              <PlaneIcon size={18} />
            </span>
            <span className="brand__name">SkyAndes</span>
          </Link>

          <button
            type="button"
            className="icon-btn app-header__menu-btn"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="visually-hidden">Menú</span>
            <span className="hamburger" aria-hidden="true" />
          </button>

          <nav id="main-nav" className={cx('app-nav', menuOpen && 'app-nav--open')} aria-label="Principal">
            <ul>
              {links
                .filter((l) => l.show)
                .map((l) => (
                  <li key={l.to}>
                    <NavLink to={l.to} end={l.end} className={({ isActive }) => cx('app-nav__link', isActive && 'app-nav__link--active')}>
                      {l.label}
                    </NavLink>
                  </li>
                ))}
            </ul>
            <div className="app-nav__tools">
              <ConnectionIndicator />
              <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={isDark ? 'Usar tema claro' : 'Usar tema oscuro'}>
                {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
              </button>
              {user ? (
                <div className="user-chip">
                  <NavLink to="/profile" className="user-chip__link" title={`${user.fullName} · ${roleLabel[user.role]}`}>
                    <span className="user-chip__avatar" aria-hidden="true">
                      {user.fullName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="user-chip__text">
                      <span className="user-chip__name">{user.fullName}</span>
                      <span className="user-chip__role">{roleLabel[user.role]}</span>
                    </span>
                  </NavLink>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      logout();
                      navigate('/');
                    }}
                  >
                    Salir
                  </Button>
                </div>
              ) : (
                <Link className="btn btn--secondary btn--sm" to="/login" state={{ from: location.pathname }}>
                  <span>Iniciar sesión</span>
                </Link>
              )}
            </div>
          </nav>
        </div>
        {showHoldBanner && active && (
          <div className="hold-banner" role="region" aria-label="Reserva en curso">
            <div className="container hold-banner__inner">
              <span>
                Asiento <strong>{active.hold.seatNumber}</strong> del vuelo <strong>{active.flight.flightNumber}</strong> bloqueado para usted
              </span>
              <HoldTimer expiresAt={active.hold.expiresAt} startedAt={active.paymentIntent.createdAt} compact />
              <Link className="btn btn--primary btn--sm" to="/checkout">
                <span>Completar compra</span>
              </Link>
            </div>
          </div>
        )}
      </header>

      <main id="main" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="container app-footer__inner">
          <p>SkyAndes · Sistema de Reservas de Vuelos en Tiempo Real</p>
          <p className="muted">Monolito modular · Flight Management · Payment · Realtime Gateway (Kafka)</p>
        </div>
      </footer>
    </div>
  );
}
