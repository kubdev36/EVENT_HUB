import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { NotificationOutbox } from './notification-outbox.entity.js';

/** Số lần thử tối đa trước khi đánh dấu failed. */
export const MAX_ATTEMPTS = 10;
/** Thời gian một tiến trình giữ các dòng đã lấy; chết giữa chừng thì sau mốc này dòng được lấy lại. */
const LOCK_MS = 5 * 60 * 1000;

/** Khoảng chờ trước lần thử thứ n (1, 2, 4... phút, tối đa 6 giờ). */
export function retryDelayMs(attempts: number): number {
  return Math.min(2 ** Math.max(attempts - 1, 0), 360) * 60 * 1000;
}

/** Thao tác trên bảng notification_outbox. */
@Injectable()
export class NotificationOutboxService {
  constructor(
    @InjectRepository(NotificationOutbox)
    private readonly repo: Repository<NotificationOutbox>,
  ) {}

  /**
   * Thêm thông báo chờ gửi cho các bài. Truyền manager để chạy chung transaction với lúc ghi bài.
   * Bài đã có dòng outbox thì bỏ qua.
   */
  async enqueue(eventIds: string[], manager?: EntityManager): Promise<void> {
    if (eventIds.length === 0) return;
    const m = manager ?? this.repo.manager;
    await m
      .createQueryBuilder()
      .insert()
      .into(NotificationOutbox)
      .values(eventIds.map((eventId) => ({ eventId, channel: 'telegram' })))
      .orIgnore()
      .execute();
  }

  /**
   * Lấy tối đa limit dòng đến hạn và giữ chúng LOCK_MS. FOR UPDATE SKIP LOCKED: nhiều tiến trình
   * chạy cùng lúc không lấy trùng một dòng.
   */
  async claimDue(
    limit: number,
    now = new Date(),
  ): Promise<Array<{ id: string; eventId: string; attempts: number }>> {
    const rows: Array<{ id: string; eventId: string; attempts: number }> =
      await this.repo.query(
        `UPDATE notification_outbox o
            SET "lockedUntil" = $2
          WHERE o.id IN (
            SELECT id FROM notification_outbox
             WHERE status = 'pending'
               AND "nextAttemptAt" <= $1
               AND ("lockedUntil" IS NULL OR "lockedUntil" < $1)
             ORDER BY "createdAt"
             LIMIT $3
             FOR UPDATE SKIP LOCKED)
        RETURNING o.id, o."eventId", o.attempts`,
        [now, new Date(now.getTime() + LOCK_MS), limit],
      );
    // UPDATE ... RETURNING của driver pg trả [rows, count].
    const list = Array.isArray(rows[0]) ? (rows[0] as typeof rows) : rows;
    return list;
  }

  async markSent(id: string, now = new Date()): Promise<void> {
    await this.repo.update(id, {
      status: 'sent',
      sentAt: now,
      lockedUntil: null,
      lastError: null,
    });
  }

  /** Gửi lỗi: hẹn lần thử sau (khoảng chờ tăng dần); quá MAX_ATTEMPTS thì failed. */
  async markFailed(
    id: string,
    attempts: number,
    error: string,
    now = new Date(),
  ): Promise<void> {
    const next = attempts + 1;
    await this.repo.update(id, {
      attempts: next,
      status: next >= MAX_ATTEMPTS ? 'failed' : 'pending',
      nextAttemptAt: new Date(now.getTime() + retryDelayMs(next)),
      lockedUntil: null,
      lastError: error.slice(0, 500),
    });
  }

  /** Trả dòng về hàng chờ, không tính là một lần thử (vd. Telegram chưa cấu hình). */
  async release(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.repo
      .createQueryBuilder()
      .update(NotificationOutbox)
      .set({ lockedUntil: null })
      .whereInIds(ids)
      .execute();
  }
}
