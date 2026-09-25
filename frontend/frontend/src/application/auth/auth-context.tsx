import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUserDto, LoginRequestDto, RegisterRequestDto } from '@reservas-vuelos/shared';
import { useServices, useSessionManager } from '../services-context';

interface AuthContextValue {
  user: AuthUserDto | null;
  token: string | null;
  isAuthenticated: boolean;
  login(input: LoginRequestDto): Promise<AuthUserDto>;
  register(input: RegisterRequestDto): Promise<AuthUserDto>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Estado global de autenticación. Al cambiar el JWT se reconecta el WebSocket
 * (el gateway autentica en el handshake) y se limpia la caché al cerrar sesión.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth, realtime } = useServices();
  const session = useSessionManager();
  const queryClient = useQueryClient();

  const current = useSyncExternalStore(
    (cb) => session.subscribe(cb),
    () => session.current,
    () => session.current,
  );

  const token = current?.accessToken ?? null;

  useEffect(() => {
    realtime.connect(token);
  }, [realtime, token]);

  useEffect(() => () => realtime.disconnect(), [realtime]);

  // Valida el token persistido contra el servidor al iniciar (usuario actualizado o sesión revocada)
  useEffect(() => {
    if (!token) return;
    auth.me().then(
      (user) => session.updateUser(user),
      () => undefined, // un 401 limpia la sesión desde el cliente HTTP
    );
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (input: LoginRequestDto) => {
      const res = await auth.login(input);
      queryClient.clear();
      return session.start(res).user;
    },
    [auth, session, queryClient],
  );

  const register = useCallback(
    async (input: RegisterRequestDto) => {
      const res = await auth.register(input);
      queryClient.clear();
      return session.start(res).user;
    },
    [auth, session, queryClient],
  );

  const logout = useCallback(() => {
    session.clear();
    queryClient.clear();
  }, [session, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: current?.user ?? null, token, isAuthenticated: !!current, login, register, logout }),
    [current, token, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
