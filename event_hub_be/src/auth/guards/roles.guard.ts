import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Mặc định từ chối: endpoint dùng RolesGuard mà quên khai báo @Roles thì không ai vào được.
    if (!requiredRoles?.length) {
      throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này');
    }

    const { user } = context.switchToHttp().getRequest();

    // Kiểm tra user có quyền phù hợp không
    const hasRole = requiredRoles.some((role) => user?.role === role);
    if (!hasRole) {
      throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này');
    }

    return true;
  }
}