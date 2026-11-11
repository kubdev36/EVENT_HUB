import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UserBodyDto {
  @ApiProperty({ example: 'staff@company.com' })
  @IsEmail()
  email: string;

  /** Họ tên hiển thị. Chuỗi rỗng nghĩa là xóa tên. */
  @ApiProperty({ example: 'Nguyễn Văn A', required: false })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  fullName?: string;

  @ApiProperty({ example: 'admin', required: false })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ example: 'MKT', required: false })
  @IsOptional()
  @IsString()
  department?: string;
}
