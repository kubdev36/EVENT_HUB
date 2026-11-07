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
import type { Response } from 'express';
import { SESSION_COOKIE, sessionCookieOptions } from '../session-cookie.js';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../service/auth.service.js';
import { LoginDto } from '../dto/login.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
    const { accessToken, ...result } = await this.authService.login(loginDto);
    // Token chỉ nằm trong cookie httpOnly, không trả trong nội dung để script trên trang không đọc được.
    res.cookie(SESSION_COOKIE, accessToken, sessionCookieOptions());
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (xóa cookie phiên)' })
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge: _maxAge, ...opts } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
    return { message: 'Logged out' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  getProfile(@Request() req: any) {
    return { user: req.user };
  }
}
