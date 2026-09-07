import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { Role } from '../../auth/enums/role.enum.js';
import { UserBodyDto } from '../dto/user-body.dto.js';
import { UsersService } from '../service/users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users' })
  async getAllUsers() {
    return this.usersService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create user' })
  @ApiBody({
    schema: {
      example: {
        email: 'staff@company.com',
        password: 'EventHub@2026',
        role: 'staff',
      },
    },
  })
  async createUser(@Body() body: UserBodyDto) {
    return this.usersService.create(body);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update user' })
  @ApiBody({
    schema: {
      example: {
        email: 'staff@company.com',
        password: 'EventHub@2026',
        role: 'admin',
      },
    },
  })
  async updateUser(@Param('id') id: string, @Body() body: UserBodyDto) {
    return this.usersService.update(id, body);
  }

  @Put(':id/reset-password')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reset password' })
  async resetPassword(@Param('id') id: string) {
    return this.usersService.resetPassword(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete user' })
  async deleteUser(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
