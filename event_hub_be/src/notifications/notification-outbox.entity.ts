import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Event } from '../events/entity/event.entity.js';

export type OutboxStatus = 'pending' | 'sent' | 'failed';

/**
 * Hàng chờ thông báo. Dòng được tạo cùng transaction với bài mới, nên bài đã lưu thì chắc chắn
 * có thông báo chờ gửi. Gửi lỗi thì thử lại theo nextAttemptAt; quá số lần thì failed.
 */
@Entity('notification_outbox')
@Index(['eventId', 'channel'], { unique: true })
@Index(['status', 'nextAttemptAt'])
export class NotificationOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event?: Event;

  @Column({ type: 'varchar', length: 16, default: 'telegram' })
  channel: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt: Date;

  /** Đang được một tiến trình xử lý tới thời điểm này; hết hạn thì tiến trình khác lấy lại. */
  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
