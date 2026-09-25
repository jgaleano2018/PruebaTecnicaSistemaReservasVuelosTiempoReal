import { AuthResponseDto, AuthUserDto, LoginInput, RegisterInput, UserRole } from '@reservas-vuelos/shared';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../../shared/domain/errors';
import { JwtService } from '../../../shared/infrastructure/auth/jwt';
import { PasswordHasher, User, UserRepository } from '../domain/user';

const toUserDto = (u: User): AuthUserDto => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role });

export class AuthUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly jwt: JwtService,
  ) {}

  private issue(u: User): AuthResponseDto {
    return {
      accessToken: this.jwt.sign({ sub: u.id, email: u.email, role: u.role, name: u.fullName }),
      expiresIn: this.jwt.expiration,
      user: toUserDto(u),
    };
  }

  async register(input: RegisterInput): Promise<AuthResponseDto> {
    if (await this.users.findByEmail(input.email)) throw new ConflictError('EMAIL_IN_USE', 'El correo ya está registrado');
    const user = await this.users.create({
      email: input.email,
      fullName: input.fullName,
      role: UserRole.CUSTOMER,
      passwordHash: await this.hasher.hash(input.password),
    });
    return this.issue(user);
  }

  async login(input: LoginInput): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !(await this.hasher.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedError('Credenciales inválidas');
    }
    return this.issue(user);
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuario', userId);
    return toUserDto(user);
  }
}
