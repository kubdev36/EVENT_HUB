import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../users/entity/user.entity.js';
import { tokenFromCookie } from './session-cookie.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      // Ưu tiên cookie httpOnly. Header Bearer chỉ giữ trong giai đoạn chuyển đổi (công cụ, phiên cũ).
      jwtFromRequest: ExtractJwt.fromExtractors([
        tokenFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt_token'),
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    department?: string | null;
  }) {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Token is invalid or the account is disabled.',
      );
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
    };
  }
}
