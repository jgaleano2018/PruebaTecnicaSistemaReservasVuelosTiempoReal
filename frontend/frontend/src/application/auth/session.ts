import { UserRole, type AuthResponseDto, type AuthUserDto } from '@reservas-vuelos/shared';
import type { KeyValueStore, Unsubscribe } from '../ports';

export interface Session {
  accessToken: string;
  user: AuthUserDto;
  /** Epoch (ms) de expiración decodificado del JWT, si está presente */
  expiresAt?: number;
}

/** Decodifica el `exp` del JWT sin validar la firma (eso lo hace el servidor). */
export function jwtExpiry(token: string): number | undefined {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return json.exp ? json.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fuente de verdad de la sesión (JWT + usuario). Es independiente de React para que
 * los adaptadores HTTP y de tiempo real puedan leer el token (inversión de dependencias).
 */
export class SessionManager {
  private session: Session | null;
  private readonly listeners = new Set<(s: Session | null) => void>();
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: KeyValueStore<Session>,
    private readonly now: () => number = Date.now,
  ) {
    const saved = store.get();
    this.session = saved && !this.isExpired(saved) ? saved : null;
    if (!this.session) store.clear();
    this.scheduleExpiry();
  }

  /** Lectura pura (sin efectos): segura para `useSyncExternalStore`. El cierre por expiración lo hace un temporizador. */
  get current(): Session | null {
    return this.session && !this.isExpired(this.session) ? this.session : null;
  }

  get token(): string | null {
    return this.current?.accessToken ?? null;
  }

  start(auth: AuthResponseDto): Session {
    const session: Session = { accessToken: auth.accessToken, user: auth.user, expiresAt: jwtExpiry(auth.accessToken) };
    this.session = session;
    this.store.set(session);
    this.scheduleExpiry();
    this.emit();
    return session;
  }

  updateUser(user: AuthUserDto): void {
    if (!this.session) return;
    this.session = { ...this.session, user };
    this.store.set(this.session);
    this.emit();
  }

  clear(): void {
    clearTimeout(this.expiryTimer);
    if (!this.session) return;
    this.session = null;
    this.store.clear();
    this.emit();
  }

  subscribe(listener: (s: Session | null) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Cierra la sesión justo cuando vence el JWT: la UI y el socket pasan a modo invitado sin esperar un 401. */
  private scheduleExpiry(): void {
    clearTimeout(this.expiryTimer);
    const expiresAt = this.session?.expiresAt;
    if (expiresAt === undefined) return;
    const MAX_DELAY = 2_147_483_647; // límite de setTimeout
    this.expiryTimer = setTimeout(() => this.clear(), Math.min(MAX_DELAY, Math.max(0, expiresAt - this.now())));
  }

  private isExpired(s: Session): boolean {
    return s.expiresAt !== undefined && s.expiresAt <= this.now();
  }

  private emit(): void {
    for (const l of this.listeners) l(this.session);
  }
}

export function hasRole(user: AuthUserDto | null | undefined, ...roles: UserRole[]): boolean {
  return !!user && roles.includes(user.role);
}

export const canBuy = (user: AuthUserDto | null | undefined) => hasRole(user, UserRole.CUSTOMER, UserRole.ADMIN);
