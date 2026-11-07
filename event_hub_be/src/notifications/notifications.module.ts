import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationOutbox } from './notification-outbox.entity.js';
import { NotificationOutboxService } from './notification-outbox.service.js';

/** Hàng chờ thông báo (outbox). Nơi tạo bài (crawl, nhập tay) dùng để thêm thông báo chờ gửi. */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationOutbox])],
  providers: [NotificationOutboxService],
  exports: [NotificationOutboxService],
})
export class NotificationsModule {}
