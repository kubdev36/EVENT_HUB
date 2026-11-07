import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Bộ lọc chung: khoảng ngày theo lịch Việt Nam (from, to tính cả hai đầu), hãng, loại. */
export class DashboardFilterDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Ngày bắt đầu (giờ Việt Nam). Mặc định 7 ngày gần nhất.',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: 'from phải có dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-07',
    description: 'Ngày kết thúc, tính cả ngày này.',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: 'to phải có dạng YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({
    example: 'cellphones,fptshop',
    description: 'Danh sách id nguồn, cách nhau bằng dấu phẩy.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  brands?: string;

  @ApiPropertyOptional({ example: 'promo' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;
}

export class BreakdownQueryDto extends DashboardFilterDto {
  @ApiPropertyOptional({ enum: ['type', 'weekday-hour', 'week'] })
  @IsIn(['type', 'weekday-hour', 'week'])
  by: 'type' | 'weekday-hour' | 'week';
}

export class EventListQueryDto extends DashboardFilterDto {
  @ApiPropertyOptional({
    description:
      'Con trỏ trang tiếp theo, lấy từ nextCursor của lần gọi trước.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ example: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
