import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RunCrawlerDto {
  @ApiProperty({ example: 'cellphones' })
  @IsString()
  id: string;
}
