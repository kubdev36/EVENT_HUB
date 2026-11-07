import { Body, Controller, Get, HttpCode, HttpStatus, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  getProfile(@Request() req: any) {
    return { user: req.user };
  }
}
