import type { CookieOptions, NextFunction, Request, Response } from 'express';

/** Cookie chứa JWT. HttpOnly nên script trên trang (kể cả khi bị XSS) không đọc được. */
export const SESSION_COOKIE = 'eh_session';
/** Access token ngắn hạn; khớp ACCESS_TOKEN_TTL của JWT. */
export const ACCESS_TOKEN_TTL = '15m';
export const SESSION_MAX_AGE_MS = 15 * 60 * 1000;

/** Refresh token: cookie riêng, chỉ gửi tới /auth (refresh, logout). */
export const REFRESH_COOKIE = 'eh_refresh';
export const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE_PATH = '/auth';

export function sessionCookieOptions(
  production = process.env.NODE_ENV === 'production',
): CookieOptions {
  return {
    httpOnly: true,
    // Strict: web khác không gửi kèm cookie khi gọi API (chống CSRF lớp thứ nhất).
    sameSite: 'strict',
    secure: production,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

export function refreshCookieOptions(
  production = process.env.NODE_ENV === 'production',
): CookieOptions {
  return {
    ...sessionCookieOptions(production),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_MAX_AGE_MS,
  };
}

/** Tùy chọn để xóa cookie: giống lúc đặt nhưng bỏ maxAge (clearCookie không nhận maxAge). */
export function withoutMaxAge(opts: CookieOptions): CookieOptions {
  const { maxAge: _maxAge, ...rest } = opts;
  return rest;
}

export function refreshTokenFromCookie(
  req: Request | undefined,
): string | null {
  const value = (req?.cookies as Record<string, unknown> | undefined)?.[
    REFRESH_COOKIE
  ];
  return typeof value === 'string' && value ? value : null;
}

/** Đọc JWT từ cookie phiên; dùng làm extractor cho passport-jwt. */
export function tokenFromCookie(req: Request | undefined): string | null {
  const value = (req?.cookies as Record<string, unknown> | undefined)?.[
    SESSION_COOKIE
  ];
  return typeof value === 'string' && value ? value : null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-requested-with';

/**
 * Chống CSRF lớp thứ hai: request ghi dữ liệu phải có header X-Requested-With.
 * Form hoặc link từ web khác không thêm được header này; fetch từ web khác thì bị CORS chặn
 * ở bước preflight vì origin không nằm trong danh sách cho phép.
 */
export const CSRF_MESSAGE = 'Thiếu header X-Requested-With (chống CSRF).';

/** Tạo middleware chống CSRF; onBlocked được gọi khi chặn một request (vd. ghi nhật ký). */
export function createCsrfMiddleware(onBlocked?: (req: Request) => void) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER)) return next();
    onBlocked?.(req);
    res.status(403).json({ statusCode: 403, message: CSRF_MESSAGE });
  };
}

export const requireCsrfHeader = createCsrfMiddleware();
