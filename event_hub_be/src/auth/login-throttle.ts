import type { ThrottlerOptions } from '@nestjs/throttler';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

type LoginRequest = { ip?: string; body?: { email?: unknown } };

/**
 * Giới hạn đăng nhập (đếm cả lần đúng và sai, lưu trong bộ nhớ của process):
 * - mỗi email: 5 lần / 15 phút, chống dò mật khẩu một tài khoản;
 * - mỗi IP: 20 lần / 15 phút, chống dò nhiều tài khoản từ một máy.
 * Khi chạy sau reverse proxy cần bật trust proxy để req.ip là IP thật.
 */
export const LOGIN_THROTTLERS: ThrottlerOptions[] = [
  {
    name: 'login-email',
    ttl: FIFTEEN_MINUTES_MS,
    limit: 5,
    getTracker: (req: Record<string, unknown>) => {
      const { body, ip } = req as LoginRequest;
      const email =
        typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      return email ? `email:${email}` : `ip:${ip ?? 'unknown'}`;
    },
  },
  {
    name: 'login-ip',
    ttl: FIFTEEN_MINUTES_MS,
    limit: 20,
    getTracker: (req: Record<string, unknown>) =>
      `ip:${(req as LoginRequest).ip ?? 'unknown'}`,
  },
];
