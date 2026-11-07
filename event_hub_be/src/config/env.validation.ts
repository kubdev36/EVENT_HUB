import { loadEncryptionKey } from '../common/secret-box.js';

/**
 * Kiểm tra biến môi trường lúc khởi động. Thiếu biến bắt buộc thì app không chạy,
 * thay vì chạy với giá trị mặc định không an toàn. Không in giá trị secret ra log.
 */
const REQUIRED = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_NAME',
  'jwt_token',
];

/** Giá trị mẫu từng nằm trong repo; không được dùng ở production. */
const KNOWN_DEFAULTS: Record<string, string[]> = {
  jwt_token: ['dev_event_hub_jwt_secret'],
  DB_PASSWORD: ['postgres'],
  INIT_ADMIN_PASSWORD: ['123456'],
};

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];
  const str = (key: string) =>
    typeof config[key] === 'string' ? (config[key] as string).trim() : '';

  for (const key of REQUIRED) {
    if (!str(key)) errors.push(`Thiếu biến môi trường ${key}`);
  }

  if (str('NODE_ENV') === 'production') {
    if (str('jwt_token') && str('jwt_token').length < 32) {
      errors.push('jwt_token phải dài ít nhất 32 ký tự ở production');
    }
    for (const [key, defaults] of Object.entries(KNOWN_DEFAULTS)) {
      if (defaults.includes(str(key)))
        errors.push(`${key} đang dùng giá trị mặc định, phải đổi ở production`);
    }
    if (!str('CORS_ORIGINS')) errors.push('Thiếu CORS_ORIGINS ở production');
    if (!str('SETTINGS_ENC_KEY'))
      errors.push(
        'Thiếu SETTINGS_ENC_KEY ở production (khóa mã hóa token Telegram)',
      );
  }

  if (str('SETTINGS_ENC_KEY')) {
    try {
      loadEncryptionKey(str('SETTINGS_ENC_KEY'));
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  if (errors.length) {
    throw new Error(
      `Cấu hình môi trường không hợp lệ:\n- ${errors.join('\n- ')}`,
    );
  }
  return config;
}

/** Danh sách origin được phép gọi API; mặc định chỉ frontend chạy local. */
export function parseCorsOrigins(value: string | undefined): string[] {
  const list = (value || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list;
}
