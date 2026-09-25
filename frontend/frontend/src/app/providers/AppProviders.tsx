import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/application/auth/auth-context';
import { CheckoutProvider } from '@/application/checkout/checkout-context';
import { ServicesProvider } from '@/application/services-context';
import { AppError } from '@/domain/errors';
import { ToastProvider } from '@/ui/components/Toast';
import type { Container } from '../container';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // No se reintentan errores de cliente (4xx); sí fallos de red / 5xx
        retry: (count, error) => !(error instanceof AppError && error.status >= 400 && error.status < 500) && count < 2,
        refetchOnWindowFocus: true,
        staleTime: 15_000,
      },
      mutations: { retry: false },
    },
  });
}

/**
 * Árbol de proveedores (gestión de estado):
 * - React Query: estado del servidor + caché que el tiempo real actualiza en sitio.
 * - Services: inyección de dependencias (puertos → adaptadores).
 * - Auth / Checkout: estado global de cliente (sesión JWT, bloqueo e intención de pago).
 */
export function AppProviders({ container, children, queryClient }: { container: Container; children: ReactNode; queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ServicesProvider services={container.services} session={container.session}>
        <ToastProvider>
          <AuthProvider>
            <CheckoutProvider store={container.checkoutStore}>{children}</CheckoutProvider>
          </AuthProvider>
        </ToastProvider>
      </ServicesProvider>
    </QueryClientProvider>
  );
}
