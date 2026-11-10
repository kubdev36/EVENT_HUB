import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Thao tác thành công lặp lại thường xuyên, chỉ ghi khi lỗi (vd. làm mới phiên mỗi 15 phút). */
const LOG_FAILURE_ONLY = new Set(['POST /auth/refresh']);

export type AuditRequest = {
  method: string;
  originalUrl?: string;
  url: string;
  route?: { path?: string };
  params?: Record<string, string | string[]>;
  body?: unknown;
  ip?: string;
  user?: { id?: string; email?: string };
};

/**
 * Ghi nhật ký mọi request ghi dữ liệu (kể cả đăng nhập), thành công hay lỗi.
 * Chỉ lưu tên trường của body, không lưu giá trị, nên không lộ mật khẩu hay token.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<AuditRequest>();
    if (!WRITE_METHODS.has(req.method)) return next.handle();

    const base = AuditInterceptor.describe(req);
    const res = context.switchToHttp().getResponse<{ statusCode: number }>();
    return next.handle().pipe(
      tap({
        next: () =>
          !LOG_FAILURE_ONLY.has(base.action) &&
          void this.audit.record({
            ...base,
            statusCode: res.statusCode,
            success: true,
            errorMessage: null,
          }),
        error: (err: unknown) =>
          void this.audit.record({
            ...base,
            statusCode: err instanceof HttpException ? err.getStatus() : 500,
            success: false,
            errorMessage: AuditInterceptor.describeError(err),
          }),
      }),
    );
  }

  /**
   * Nội dung lỗi dễ đọc cho trang Nhật ký: lấy chi tiết của HttpException
   * (vd. từng lỗi kiểm tra dữ liệu), ghi rõ lỗi hệ thống và che giá trị bí mật.
   */
  static describeError(err: unknown): string {
    let text: string;
    if (err instanceof HttpException) {
      const body = err.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : (body as { message?: unknown })?.message;
      const parts = Array.isArray(detail)
        ? detail.map(String)
        : [typeof detail === 'string' && detail ? detail : err.message];
      text = parts.join('; ');
      if (err.getStatus() === 400 && Array.isArray(detail))
        text = `Lỗi dữ liệu: ${text}`;
    } else if (err instanceof Error) {
      text = `Lỗi hệ thống (${err.name}): ${err.message}`;
    } else {
      text = `Lỗi hệ thống: ${String(err)}`;
    }
    return AuditInterceptor.redactSecrets(text).slice(0, 500);
  }

  /** Che giá trị dạng token=..., password: ..., bot123:ABC... trong nội dung lỗi. */
  static redactSecrets(text: string): string {
    return text
      .replace(
        /\b(password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
        '$1$2***',
      )
      .replace(/\bbot\d+:[\w-]{20,}/gi, 'bot***')
      .replace(/\bBearer\s+[\w.-]+/gi, 'Bearer ***');
  }

  static describe(req: AuditRequest) {
    const path = (req.originalUrl || req.url).split('?')[0];
    const route = req.route?.path || path;
    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : null;
    const isLogin = route === '/auth/login';
    // Đăng nhập: chưa có req.user, ghi email được nhập để thấy các lần đoán mật khẩu.
    const loginEmail =
      isLogin && typeof body?.email === 'string'
        ? body.email.trim().toLowerCase()
        : null;
    const target =
      Object.values(req.params ?? {})
        .flat()
        .join(',') || null;
    return {
      userId: req.user?.id ?? null,
      userEmail: req.user?.email ?? loginEmail,
      action: isLogin ? 'auth.login' : `${req.method} ${route}`,
      target,
      fields: body ? Object.keys(body).slice(0, 50) : null,
      ip: req.ip ?? null,
    };
  }
}
