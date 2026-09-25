import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { UserRole } from '@reservas-vuelos/shared';
import { AppLayout } from '@/ui/layout/AppLayout';
import { RequireAuth } from '@/ui/layout/RequireAuth';
import { LoadingBlock } from '@/ui/components/primitives';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { SearchPage } from '@/ui/pages/SearchPage';

/* División de código por ruta: el dashboard y la administración se cargan bajo demanda. */
const LoginPage = lazy(() => import('@/ui/pages/AuthPages').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/ui/pages/AuthPages').then((m) => ({ default: m.RegisterPage })));
const SeatSelectionPage = lazy(() => import('@/ui/pages/SeatSelectionPage').then((m) => ({ default: m.SeatSelectionPage })));
const CheckoutPage = lazy(() => import('@/ui/pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const TicketPage = lazy(() => import('@/ui/pages/TicketPage').then((m) => ({ default: m.TicketPage })));
const MyTripsPage = lazy(() => import('@/ui/pages/MyTripsPage').then((m) => ({ default: m.MyTripsPage })));
const ProfilePage = lazy(() => import('@/ui/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const DashboardPage = lazy(() => import('@/ui/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FlightMonitorPage = lazy(() => import('@/ui/pages/FlightMonitorPage').then((m) => ({ default: m.FlightMonitorPage })));
const AdminPage = lazy(() => import('@/ui/pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const NotFoundPage = lazy(() => import('@/ui/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

const page = (node: ReactNode) => (
  <Suspense
    fallback={
      <div className="container page">
        <LoadingBlock rows={4} />
      </div>
    }
  >
    {node}
  </Suspense>
);

const buyer = [UserRole.CUSTOMER, UserRole.ADMIN];

export const routes = [
  {
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'login', element: page(<LoginPage />) },
      { path: 'register', element: page(<RegisterPage />) },
      { path: 'flights/:flightId', element: page(<SeatSelectionPage />) },
      { path: 'checkout', element: page(<RequireAuth roles={buyer}>{<CheckoutPage />}</RequireAuth>) },
      { path: 'reservations/:reservationId/ticket', element: page(<RequireAuth>{<TicketPage />}</RequireAuth>) },
      { path: 'my-trips', element: page(<RequireAuth>{<MyTripsPage />}</RequireAuth>) },
      { path: 'profile', element: page(<RequireAuth>{<ProfilePage />}</RequireAuth>) },
      { path: 'dashboard', element: page(<DashboardPage />) },
      { path: 'dashboard/flights/:flightId', element: page(<FlightMonitorPage />) },
      { path: 'admin', element: page(<RequireAuth roles={[UserRole.ADMIN]}>{<AdminPage />}</RequireAuth>) },
      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
