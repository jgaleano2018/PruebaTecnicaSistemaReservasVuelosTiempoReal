import { createContext, useContext, type ReactNode } from 'react';
import type { Services } from './ports';
import type { SessionManager } from './auth/session';

interface Ctx {
  services: Services;
  session: SessionManager;
}

const ServicesContext = createContext<Ctx | null>(null);

/** Inyección de dependencias para la UI (permite sustituir adaptadores en pruebas). */
export function ServicesProvider({ services, session, children }: Ctx & { children: ReactNode }) {
  return <ServicesContext.Provider value={{ services, session }}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices debe usarse dentro de <ServicesProvider>');
  return ctx.services;
}

export function useSessionManager(): SessionManager {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useSessionManager debe usarse dentro de <ServicesProvider>');
  return ctx.session;
}
