import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class TelegramConfigDto {
  @ApiProperty({ example: '123456:ABC-DEF...' })
  @IsString()
  botToken: string;

  @ApiProperty({ example: '-1001234567890' })
  @IsString()
  chatId: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  notifyImmediately?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  includeImage?: boolean;
}
