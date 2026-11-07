import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ImageStorage } from './image-storage.js';

/**
 * Phục vụ ảnh thu nhỏ đã lưu. Không cần đăng nhập vì thẻ <img> không gửi kèm token:
 * tên file là sha256 khó đoán và nội dung là ảnh công khai của web nguồn.
 * Chuyển sang bắt đăng nhập khi có cookie httpOnly.
 */
@Controller('images')
export class ImagesController {
  constructor(private readonly storage: ImageStorage) {}

  @Get(':name')
  async get(@Param('name') name: string, @Res() res: Response) {
    const file = this.storage.absolutePath(name);
    if (!file || !(await this.storage.exists(name)))
      throw new NotFoundException();
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Frontend chạy ở origin khác nên cần cho phép nhúng ảnh khác origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Tên file theo nội dung link, không đổi: cache dài hạn.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file);
  }
}
