import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Cấu hình trích xuất HTML riêng của nguồn (xem ExtractConfig trong crawler.types.ts). */
export class ExtractConfigDto {
  @ApiProperty({ required: false, example: 'ul.newspromotion > li' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  itemSelector?: string;

  @ApiProperty({ required: false, example: 'h3' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  titleSelector?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  linkSelector?: string;

  @ApiProperty({ required: false, example: '.timepost' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  dateSelector?: string;

  @ApiProperty({ required: false, example: ['data-original', 'src'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  imageAttrs?: string[];

  @ApiProperty({ required: false, example: '^/tin-tuc/[a-z0-9-]+-\\d+$' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  articleUrlPattern?: string;

  @ApiProperty({ required: false, example: 'người có ảnh hưởng|chính sách' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  excludeTitlePattern?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  fetchDetail?: boolean;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  maxDetailPerRun?: number;

  @ApiProperty({ required: false, example: 2000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  detailDelayMs?: number;
}

/** Nguồn lấy qua API riêng (hiện hỗ trợ GraphQL kiểu Sforum). */
export class ApiSourceConfigDto {
  @ApiProperty({ enum: ['sforum-graphql'] })
  @IsIn(['sforum-graphql'])
  type: 'sforum-graphql';

  @ApiProperty({ example: 'https://api.sforum.vn/graphql/query' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  endpoint: string;

  @ApiProperty({ example: [10078, 27510] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(1, { each: true })
  categoryIds: number[];

  @ApiProperty({ example: 'https://cellphones.com.vn/sforum/' })
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  articleBaseUrl: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  referer?: string;

  @ApiProperty({ required: false, example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPages?: number;
}

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ajaxEndpoint?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ajaxPayload?: string;

  @ApiProperty({ type: ExtractConfigDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractConfigDto)
  extract?: ExtractConfigDto;

  @ApiProperty({ type: ApiSourceConfigDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ApiSourceConfigDto)
  api?: ApiSourceConfigDto;
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
