import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** Tiền tố đánh dấu giá trị đã mã hóa, để phân biệt với dữ liệu cũ dạng chữ thường. */
const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Đọc khóa 32 byte từ SETTINGS_ENC_KEY (base64 hoặc hex 64 ký tự).
 * Trả null khi chưa cấu hình; sai định dạng thì ném lỗi.
 */
export function loadEncryptionKey(
  raw: string | undefined = process.env.SETTINGS_ENC_KEY,
): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32)
    throw new Error(
      'SETTINGS_ENC_KEY phải là 32 byte (base64 hoặc 64 ký tự hex)',
    );
  return key;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** AES-256-GCM: mỗi lần mã hóa dùng IV ngẫu nhiên; tag xác thực chống sửa dữ liệu. */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return (
    PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  );
}

/** Ném lỗi nếu sai khóa hoặc dữ liệu bị sửa. */
export function decryptSecret(value: string, key: Buffer): string {
  if (!isEncrypted(value)) throw new Error('Giá trị chưa được mã hóa');
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES)
    throw new Error('Dữ liệu mã hóa không hợp lệ');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    buf.subarray(0, IV_BYTES),
  );
  decipher.setAuthTag(buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(buf.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}

/** "••••ABCD" để hiển thị token đã lưu mà không lộ giá trị. */
export function maskSecret(plain: string): string {
  return plain.length > 8 ? `••••${plain.slice(-4)}` : '••••';
}
