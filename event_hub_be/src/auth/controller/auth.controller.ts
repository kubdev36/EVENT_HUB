import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  refreshTokenFromCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
  withoutMaxAge,
} from '../session-cookie.js';
import { IssuedSession, SessionService } from '../service/session.service.js';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../service/auth.service.js';
import { LoginDto } from '../dto/login.dto.js';
import { ChangePasswordDto } from '../dto/change-password.dto.js';
import { AllowPendingPasswordChange } from '../decorators/allow-pending-password-change.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /** Đặt cookie access token (15 phút) và refresh token (7 ngày, chỉ gửi tới /auth). */
  private static setSessionCookies(res: Response, s: IssuedSession) {
    res.cookie(SESSION_COOKIE, s.accessToken, sessionCookieOptions());
    res.cookie(REFRESH_COOKIE, s.refreshToken, refreshCookieOptions());
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login' })
  @ApiBody({
    schema: {
      example: {
        email: 'admin@example.com',
        password: 'your-password',
      },
    },
  })
  @ApiOkResponse({ description: 'Login successful' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    // Token chỉ nằm trong cookie httpOnly, không trả trong nội dung để script trên trang không đọc được.
    AuthController.setSessionCookies(
      res,
      await this.sessions.issue(result.user),
    );
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi refresh token lấy phiên mới (xoay vòng)' })
  async refresh(
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.sessions.rotate(refreshTokenFromCookie(req));
    AuthController.setSessionCookies(res, session);
    return { user: session.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (xóa cookie phiên)' })
  async logout(
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Thu hồi refresh token ở server, không chỉ xóa cookie.
    await this.sessions.revoke(refreshTokenFromCookie(req));
    res.clearCookie(SESSION_COOKIE, withoutMaxAge(sessionCookieOptions()));
    res.clearCookie(REFRESH_COOKIE, withoutMaxAge(refreshCookieOptions()));
    return { message: 'Logged out' };
  }

  /**
   * Đổi mật khẩu của chính mình. Xong thì thu hồi mọi phiên cũ (máy khác đăng xuất) và cấp
   * phiên mới cho trình duyệt đang dùng. Giới hạn số lần thử như đăng nhập.
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi mật khẩu (bắt buộc khi đang dùng mật khẩu tạm)' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Request() req: { user: { id: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.changePassword(req.user.id, dto);
    await this.sessions.revokeAllForUser(user.id);
    AuthController.setSessionCookies(res, await this.sessions.issue(user));
    return { message: 'Đã đổi mật khẩu.', user };
  }

  @UseGuards(JwtAuthGuard)
  @AllowPendingPasswordChange()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  getProfile(@Request() req: any) {
    return { user: req.user };
  }
}
