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
  Matches,
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

  @ApiProperty({
    required: false,
    example: 'title',
    description:
      'Lấy tiêu đề từ thuộc tính này của phần tử titleSelector thay vì chữ bên trong',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$/)
  titleAttr?: string;

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

/** Sitemap theo dõi trang mới của nguồn (xem SitemapConfig trong crawler.types.ts). */
export class SitemapConfigDto {
  @ApiProperty({ example: 'https://hoanghamobile.com/sitemap.xml' })
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  url: string;

  @ApiProperty({
    example: 'sale|uu-dai|deal|khuyen-mai|giam-gia',
    description: 'Regex trên pathname; chỉ link khớp mới được xét',
  })
  @IsString()
  @MaxLength(500)
  includePattern: string;

  @ApiProperty({ required: false, example: 'tra-gop|chinh-sach' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excludePattern?: string;

  @ApiProperty({
    required: false,
    example: 'page-sitemap',
    description: 'Với sitemap index: chỉ mở file con khớp regex này',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  childPattern?: string;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxNewPerRun?: number;
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

  @ApiProperty({ example: '/img/mtm.png', required: false })
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
  @Matches(/^https?:\/\/[^\s]+$/i, {
    each: true,
    message: 'Mỗi đường dẫn phải bắt đầu bằng http:// hoặc https://',
  })
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

  @ApiProperty({ required: false, example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  minRequestIntervalMs?: number;

  @ApiProperty({
    required: false,
    description:
      'Lưu ảnh thu nhỏ về máy chủ; mặc định true với web, false với facebook',
  })
  @IsOptional()
  @IsBoolean()
  storeImages?: boolean;

  @ApiProperty({ type: [SitemapConfigDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SitemapConfigDto)
  sitemaps?: SitemapConfigDto[];
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
