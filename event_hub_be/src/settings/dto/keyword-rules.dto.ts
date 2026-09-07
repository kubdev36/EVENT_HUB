import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

export class KeywordRuleDto {
  @ApiProperty({ example: 'sale' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'Khuyen mai' })
  @IsString()
  label: string;

  @ApiProperty({ example: 'sale, giam gia, uu dai' })
  @IsString()
  keywords: string;
}

export class SaveKeywordRulesDto {
  @ApiProperty({ type: [KeywordRuleDto] })
  @ValidateNested({ each: true })
  @Type(() => KeywordRuleDto)
  @IsArray()
  rules: KeywordRuleDto[];
}
