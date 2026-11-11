import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  EVENT_TYPE_CODE,
  EVENT_TYPE_COLORS,
} from '../../events/event-type-config.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class KeywordRuleDto {
  @ApiProperty({ example: 'tra_gop' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(EVENT_TYPE_CODE, {
    message:
      'Mã loại chỉ gồm chữ thường không dấu, số và dấu gạch dưới (2–30 ký tự), bắt đầu bằng chữ',
  })
  type: string;

  @ApiProperty({ example: 'Trả góp' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên loại' })
  @MaxLength(50, { message: 'Tên loại tối đa 50 ký tự' })
  label: string;

  @ApiProperty({ example: 'tra gop, 0%, lai suat 0' })
  @IsString()
  @MaxLength(2000, { message: 'Từ khóa tối đa 2000 ký tự' })
  keywords: string;

  @ApiProperty({ example: 'teal', enum: EVENT_TYPE_COLORS, required: false })
  @IsOptional()
  @IsIn(EVENT_TYPE_COLORS, { message: 'Màu không hợp lệ' })
  color?: string;
}

export class SaveKeywordRulesDto {
  @ApiProperty({ type: [KeywordRuleDto] })
  @ValidateNested({ each: true })
  @Type(() => KeywordRuleDto)
  @IsArray()
  @ArrayMaxSize(30, { message: 'Tối đa 30 loại' })
  rules: KeywordRuleDto[];
}
