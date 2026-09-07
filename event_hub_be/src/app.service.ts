import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    if (this.dataSource.isInitialized) {
      this.logger.log('✅ Kết nối PostgreSQL thành công!');
    } else {
      this.logger.error('❌ Không thể kết nối tới PostgreSQL!');
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}