import { BadRequestException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import sharp from 'sharp';
import type { ImageStorage } from './image-storage.js';

/** File logo tải lên tối đa 2 MB. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_SIZE = 256;
const logger = new Logger('LogoUpload');
const MAX_INPUT_PIXELS = 40_000_000;
/** Định dạng nhận, xác định từ nội dung file (sharp), không tin tên hay Content-Type. SVG bị loại. */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

/**
 * Thu logo về tối đa 256x256, lưu webp, trả về đường dẫn /images/<tên>.
 * Tên file theo sha256 nội dung đã xử lý: cùng logo dùng chung một file.
 */
export async function storeLogo(
  storage: ImageStorage,
  data: Buffer | undefined,
): Promise<string> {
  if (!data?.length) throw new BadRequestException('Chưa chọn file logo.');
  if (data.length > MAX_LOGO_BYTES)
    throw new BadRequestException('Logo quá 2 MB.');

  let format: string | undefined;
  try {
    format = (await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS }).metadata())
      .format;
  } catch (err) {
    // Ghi lý do sharp từ chối (không ghi nội dung file), rồi báo 400 cho người dùng.
    logger.debug(`Không đọc được file logo: ${err instanceof Error ? err.message : String(err)}`);
    format = undefined;
  }
  if (!format || !ACCEPTED_FORMATS.has(format))
    throw new BadRequestException(
      'File không phải ảnh được hỗ trợ (chỉ nhận PNG, JPG, WEBP, GIF).',
    );

  const webp = await sharp(data, {
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false,
  })
    .rotate()
    .resize({
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  const name = `${createHash('sha256').update(webp).digest('hex')}.webp`;
  await storage.save(name, webp);
  return `/images/${name}`;
}

const DATA_URL_LOGO = /^data:image\/[a-z]+;base64,(.*)$/is;

/**
 * Đổi logo base64 cũ (data:image/...) thành file /images/... để cấu hình không phình to.
 * Logo không đọc được thì báo lỗi, không lặng lẽ xóa.
 */
export async function convertDataUrlLogos<T extends { logo?: string | null }>(
  storage: ImageStorage,
  targets: T[],
): Promise<T[]> {
  return Promise.all(
    targets.map(async (t) => {
      const match = typeof t.logo === 'string' && DATA_URL_LOGO.exec(t.logo);
      if (!match) return t;
      const data = Buffer.from(match[1], 'base64');
      return { ...t, logo: await storeLogo(storage, data) };
    }),
  );
}
