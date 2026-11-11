import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-pending-password-change.decorator.js';

/** Mã lỗi để frontend chuyển sang màn hình đổi mật khẩu. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * Xác thực cookie phiên. Tài khoản còn mật khẩu tạm (mustChangePassword) chỉ gọi được các
 * endpoint gắn @AllowPendingPasswordChange; mọi endpoint khác trả 403 PASSWORD_CHANGE_REQUIRED.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;
    const user = context.switchToHttp().getRequest().user as
      | { mustChangePassword?: boolean }
      | undefined;
    if (!user?.mustChangePassword) return true;
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;
    throw new ForbiddenException({
      statusCode: 403,
      code: PASSWORD_CHANGE_REQUIRED,
      message: 'Bạn cần đổi mật khẩu tạm trước khi tiếp tục.',
    });
  }
}
