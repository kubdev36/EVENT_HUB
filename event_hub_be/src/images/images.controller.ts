import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { Response } from 'express';
import { ImageStorage } from './image-storage.js';

/**
 * Phục vụ ảnh thu nhỏ đã lưu, chỉ cho người đã đăng nhập. Thẻ <img> tự gửi cookie phiên
 * (cùng site), nên không cần token trong URL.
 */
@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly storage: ImageStorage) {}

  @Get(':name')
  async get(@Param('name') name: string, @Res() res: Response) {
    const file = this.storage.absolutePath(name);
    if (!file || !(await this.storage.exists(name)))
      throw new NotFoundException();
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Frontend khác origin (khác cổng) nhưng cùng site; web khác site không nhúng được ảnh.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    // private: chỉ trình duyệt cache, proxy dùng chung không được cache ảnh cần đăng nhập.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(file);
  }
}
