import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@reservas-vuelos/shared';
import { useAuth } from '@/application/auth/auth-context';
import { roleLabel } from '@/domain/labels';
import { Alert } from '../components/primitives';

/** Guardia de rutas: exige sesión y, opcionalmente, alguno de los roles indicados. */
export function RequireAuth({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="container page">
        <Alert tone="warning" title="Acceso restringido">
          Esta sección requiere el rol {roles.map((r) => roleLabel[r]).join(' o ')}. Su rol actual es {roleLabel[user.role]}.
        </Alert>
      </div>
    );
  }
  return <>{children}</>;
}
