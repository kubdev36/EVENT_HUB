import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CrawlerSourceItemDto {
  @ApiProperty({ example: 'cellphones' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'CellphoneS' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'web', required: false, enum: ['web', 'facebook'] })
  @IsOptional()
  @IsIn(['web', 'facebook'])
  type?: 'web' | 'facebook';

  @ApiProperty({ example: '/img/mtm.jpg', required: false })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ example: '6h', required: false })
  @IsOptional()
  @IsString()
  interval?: string;

  @ApiProperty({ example: ['https://cellphones.com.vn/danh-sach-khuyen-mai'] })
  @IsArray()
  @IsString({ each: true })
  targetUrls: string[];
}

export class SaveCrawlerSourcesDto {
  @ApiProperty({ type: [CrawlerSourceItemDto], required: false })
  @ValidateNested({ each: true })
  @Type(() => CrawlerSourceItemDto)
  @IsOptional()
  @IsArray()
  targets?: CrawlerSourceItemDto[];

  @ApiProperty({ type: [CrawlerSourceItemDto], required: false })
  @ValidateNested({ each: true })
  @Type(() => CrawlerSourceItemDto)
  @IsOptional()
  @IsArray()
  sources?: CrawlerSourceItemDto[];
}
