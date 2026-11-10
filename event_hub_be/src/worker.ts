import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

// Worker: chạy lịch, xử lý việc crawl từ hàng đợi và gửi thông báo; không mở cổng HTTP.
// Đặt vai trò trước khi nạp AppModule (các service đọc PROCESS_ROLE lúc khởi tạo).
process.env.PROCESS_ROLE = 'worker';

async function bootstrap() {
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule);
  // SIGTERM/SIGINT: pg-boss dừng nhận việc mới và chờ việc đang chạy xong.
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker đã khởi động');
}

void bootstrap();
