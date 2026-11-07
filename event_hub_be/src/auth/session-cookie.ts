import type { CookieOptions, NextFunction, Request, Response } from 'express';

/** Cookie chứa JWT. HttpOnly nên script trên trang (kể cả khi bị XSS) không đọc được. */
export const SESSION_COOKIE = 'eh_session';
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // khớp expiresIn '1d' của JWT

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
export function requireCsrfHeader(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER)) return next();
  res.status(403).json({
    statusCode: 403,
    message: 'Thiếu header X-Requested-With (chống CSRF).',
  });
}
