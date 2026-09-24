import jwt, { SignOptions } from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { JwtPayloadDto, UserRole } from '@reservas-vuelos/shared';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayloadDto;
    }
  }
}

export class JwtService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(payload: JwtPayloadDto): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn } as SignOptions);
  }

  verify(token: string): JwtPayloadDto {
    try {
      return jwt.verify(token, this.secret) as JwtPayloadDto;
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }
  }

  get expiration(): string {
    return this.expiresIn;
  }
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/** Middleware: exige JWT válido (Autenticación). */
export const authenticate =
  (jwtService: JwtService) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractToken(req);
    if (!token) return next(new UnauthorizedError());
    try {
      req.user = jwtService.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };

/** Middleware: si hay token lo decodifica, si no continúa como anónimo. */
export const optionalAuth =
  (jwtService: JwtService) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractToken(req);
    if (token) {
      try {
        req.user = jwtService.verify(token);
      } catch {
        /* token inválido => anónimo */
      }
    }
    next();
  };

/** Middleware: Autorización por rol. */
export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };

/** Middleware para endpoints internos entre servicios (x-internal-api-key). */
export const internalOnly =
  (apiKey: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (req.headers['x-internal-api-key'] !== apiKey) return next(new ForbiddenError('Endpoint interno'));
    next();
  };
