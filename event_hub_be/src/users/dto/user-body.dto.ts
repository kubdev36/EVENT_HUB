import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UserBodyDto {
  @ApiProperty({ example: 'staff@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'EventHub@2026', required: false })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: 'admin', required: false })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ example: 'MKT', required: false })
  @IsOptional()
  @IsString()
  department?: string;
}
