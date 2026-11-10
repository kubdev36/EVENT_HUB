// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../users/entity/user.entity.js';
import { AuthService } from './service/auth.service.js';
import { AuthController } from './controller/auth.controller.js';
import { JwtStrategy } from './jwt.strategy.js';
import { RolesGuard } from './guards/roles.guard.js'; // 1. Import RolesGuard
import { ThrottlerModule } from '@nestjs/throttler';
import { LOGIN_THROTTLERS } from './login-throttle.js';
import { RefreshToken } from './refresh-token.entity.js';
import { SessionService } from './service/session.service.js';
import { ACCESS_TOKEN_TTL } from './session-cookie.js';
import { PasswordHasher } from './password-hasher.js';

@Module({
  imports: [
    ThrottlerModule.forRoot({ throttlers: LOGIN_THROTTLERS }),
    TypeOrmModule.forFeature([User, RefreshToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt_token'),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    SessionService,
    { provide: PasswordHasher, useFactory: () => new PasswordHasher() },
  ], // 2. Thêm RolesGuard vào đây
  exports: [
    AuthService,
    PassportModule,
    RolesGuard,
    SessionService,
    PasswordHasher,
  ],
})
export class AuthModule {}
