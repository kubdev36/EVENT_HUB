import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role } from '../auth/enums/role.enum.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { Response } from 'express';
import { ImageStorage } from './image-storage.js';
import { MAX_LOGO_BYTES, storeLogo } from './logo-upload.js';

/**
 * Phục vụ ảnh thu nhỏ đã lưu, chỉ cho người đã đăng nhập. Thẻ <img> tự gửi cookie phiên
 * (cùng site), nên không cần token trong URL.
 */
@Controller('images')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImagesController {
  constructor(private readonly storage: ImageStorage) {}

  /** Tải logo đối thủ lên; cấu hình nguồn chỉ lưu đường dẫn trả về, không lưu ảnh base64. */
  @Post('logo')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Upload competitor logo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }),
  )
  async uploadLogo(@UploadedFile() file: { buffer?: Buffer } | undefined) {
    return { url: await storeLogo(this.storage, file?.buffer) };
  }

  @Get(':name')
  @Roles(Role.ADMIN, Role.STAFF)
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
