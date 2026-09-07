import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'release', enum: ['release', 'sale', 'livestream', 'ads', 'promo', 'live', 'internal', 'other'] })
  @IsString()
  @IsIn(['release', 'sale', 'livestream', 'ads', 'promo', 'live', 'internal', 'other'])
  type: string;

  @ApiProperty({ example: 'Samsung ra mat Galaxy S26' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'minhtuan', required: false })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiProperty({ example: 'Minh Tuấn Mobile', required: false })
  @IsOptional()
  @IsString()
  sourceName?: string;

  @ApiProperty({ example: 'Su kien ra mat san pham moi', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2026-08-28T14:00:00.000Z', required: false })
  @IsOptional()
  @IsString()
  eventDate?: string;

  @ApiProperty({ example: '14:00', required: false })
  @IsOptional()
  @IsString()
  eventTime?: string;

  @ApiProperty({ example: 'https://example.com/image.jpg', required: false })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({ example: 'https://example.com/event', required: false })
  @IsOptional()
  @IsString()
  url?: string;
}
