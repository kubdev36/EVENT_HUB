import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/** Tên file ảnh hợp lệ: sha256 hex + .webp. Mọi thứ khác bị từ chối (chống `../`). */
const IMAGE_NAME = /^[a-f0-9]{64}\.webp$/;

export function isValidImageName(name: string): boolean {
  return IMAGE_NAME.test(name);
}

/**
 * Nơi lưu ảnh thu nhỏ. Hiện lưu trên ổ đĩa; sau này đổi sang MinIO chỉ cần viết lớp khác
 * cùng interface, ImageStoreService không đổi.
 */
export abstract class ImageStorage {
  abstract exists(name: string): Promise<boolean>;
  abstract save(name: string, data: Buffer): Promise<void>;
  /** Đường dẫn tuyệt đối để gửi file; null nếu tên không hợp lệ. */
  abstract absolutePath(name: string): string | null;
}

@Injectable()
export class LocalDiskImageStorage extends ImageStorage {
  readonly root: string;

  constructor(root = process.env.IMAGE_STORE_DIR || './storage/images') {
    super();
    this.root = path.resolve(root);
  }

  absolutePath(name: string): string | null {
    return isValidImageName(name) ? path.join(this.root, name) : null;
  }

  async exists(name: string): Promise<boolean> {
    const file = this.absolutePath(name);
    if (!file) return false;
    try {
      await fs.access(file);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async save(name: string, data: Buffer): Promise<void> {
    const file = this.absolutePath(name);
    if (!file) throw new Error(`Tên file ảnh không hợp lệ: ${name}`);
    await fs.mkdir(this.root, { recursive: true });
    // Ghi file tạm rồi đổi tên, để không bao giờ phục vụ một file ghi dở.
    const tmp = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  }
}
