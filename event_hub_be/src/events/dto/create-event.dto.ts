import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const HTTP_URL = /^https?:\/\/[^\s]+$/i;

export class CreateEventDto {
  @ApiProperty({ example: 'release', enum: ['release', 'sale', 'livestream', 'ads', 'promo', 'live', 'internal', 'other'] })
  @IsString()
  @IsIn(['release', 'sale', 'livestream', 'ads', 'promo', 'live', 'internal', 'other'])
  type: string;

  @ApiProperty({ example: 'Samsung ra mắt Galaxy S26' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tiêu đề' })
  @MaxLength(500)
  title: string;

  /** Phải là nguồn có trong cấu hình crawler_sources hoặc 'minhtuan'; tên lấy từ cấu hình. */
  @ApiProperty({ example: 'minhtuan', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceId?: string;

  /** Bỏ qua: tên nguồn luôn lấy từ cấu hình, không lấy từ người gửi. Giữ để client cũ không bị 400. */
  @ApiProperty({ example: 'Minh Tuấn Mobile', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceName?: string;

  @ApiProperty({ example: 'Sự kiện ra mắt sản phẩm mới', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: '2026-08-28T14:00:00.000Z', required: false })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày sự kiện không hợp lệ' })
  eventDate?: string;

  @ApiProperty({ example: '14:00', required: false })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Giờ phải có dạng HH:mm' })
  eventTime?: string;

  @ApiProperty({ example: 'https://example.com/image.jpg', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(HTTP_URL, { message: 'Link ảnh phải bắt đầu bằng http:// hoặc https://' })
  image?: string;

  @ApiProperty({ example: 'https://example.com/event', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(HTTP_URL, { message: 'Link bài viết phải bắt đầu bằng http:// hoặc https://' })
  url?: string;
}
