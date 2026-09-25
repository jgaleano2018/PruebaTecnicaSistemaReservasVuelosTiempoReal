import { JwtService } from '../../shared/infrastructure/auth/jwt';
import { AuthUseCases } from './application/auth.use-cases';
import { PasswordHasher, UserRepository } from './domain/user';
import { buildAuthRouter } from './infrastructure/http/auth.routes';

/** Autenticación y autorización (JWT) - Capa de Infraestructura y Comunicación. */
export function createAuthModule(d: { users: UserRepository; hasher: PasswordHasher; jwt: JwtService }) {
  const useCases = new AuthUseCases(d.users, d.hasher, d.jwt);
  return { router: buildAuthRouter(d.jwt, useCases), api: useCases };
}
