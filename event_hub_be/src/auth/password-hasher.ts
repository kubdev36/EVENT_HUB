import * as bcrypt from 'bcrypt';
import { createHmac } from 'crypto';

/** Tiền tố mã băm có pepper; mã băm không có tiền tố là kiểu cũ (bcrypt mật khẩu thô). */
const PEPPERED_PREFIX = 'p1$';
const BCRYPT_ROUNDS = 10;

/**
 * Băm mật khẩu: HMAC-SHA256(mật khẩu, PASSWORD_PEPPER) rồi bcrypt. Pepper nằm trong biến môi trường,
 * không nằm trong DB: lộ DB mà không có pepper thì không dò được mật khẩu.
 * Chưa cấu hình PASSWORD_PEPPER thì băm kiểu cũ (bcrypt mật khẩu thô) để app vẫn chạy ở dev.
 * Đổi hoặc mất pepper thì mọi mật khẩu kiểu mới không đăng nhập được, phải đặt lại.
 */
export class PasswordHasher {
  constructor(
    private readonly pepper: string | undefined = process.env.PASSWORD_PEPPER,
  ) {}

  private peppered(password: string): string {
    return createHmac('sha256', this.pepper!)
      .update(password, 'utf8')
      .digest('base64');
  }

  async hash(password: string): Promise<string> {
    if (!this.pepper) return bcrypt.hash(password, BCRYPT_ROUNDS);
    return (
      PEPPERED_PREFIX +
      (await bcrypt.hash(this.peppered(password), BCRYPT_ROUNDS))
    );
  }

  /**
   * So khớp mật khẩu. needsUpgrade = true khi khớp với mã băm kiểu cũ và đã có pepper:
   * nơi gọi nên băm lại để nâng cấp.
   */
  async verify(
    password: string,
    stored: string,
  ): Promise<{ ok: boolean; needsUpgrade: boolean }> {
    if (stored.startsWith(PEPPERED_PREFIX)) {
      if (!this.pepper) return { ok: false, needsUpgrade: false };
      const ok = await bcrypt.compare(
        this.peppered(password),
        stored.slice(PEPPERED_PREFIX.length),
      );
      return { ok, needsUpgrade: false };
    }
    const ok = await bcrypt.compare(password, stored);
    return { ok, needsUpgrade: ok && Boolean(this.pepper) };
  }
}
