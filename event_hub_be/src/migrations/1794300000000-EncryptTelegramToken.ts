import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  loadEncryptionKey,
} from '../common/secret-box.js';

/**
 * Mã hóa token bot Telegram đang lưu dạng chữ thường trong settings.telegram_config.
 * Cần SETTINGS_ENC_KEY. Không có token thì không làm gì. Không ghi token ra log.
 */
export class EncryptTelegramToken1794300000000 implements MigrationInterface {
  name = 'EncryptTelegramToken1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.transform(queryRunner, (token, key) =>
      isEncrypted(token) ? null : encryptSecret(token, key),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.transform(queryRunner, (token, key) =>
      isEncrypted(token) ? decryptSecret(token, key) : null,
    );
  }

  /** Áp fn lên botToken; fn trả null nghĩa là giữ nguyên. */
  private async transform(
    queryRunner: QueryRunner,
    fn: (token: string, key: Buffer) => string | null,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT value FROM settings WHERE key = 'telegram_config'`,
    )) as Array<{ value: Record<string, unknown> | null }>;
    const value = rows[0]?.value;
    const token = value?.botToken;
    if (typeof token !== 'string' || !token) return;

    const key = loadEncryptionKey();
    if (!key)
      throw new Error(
        'Có token Telegram trong DB nhưng chưa cấu hình SETTINGS_ENC_KEY; thêm khóa vào .env rồi chạy lại.',
      );
    const next = fn(token, key);
    if (next === null) return;
    await queryRunner.query(
      `UPDATE settings SET value = $1 WHERE key = 'telegram_config'`,
      [JSON.stringify({ ...value, botToken: next })],
    );
  }
}
