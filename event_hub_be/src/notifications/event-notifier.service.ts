import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Event } from '../events/entity/event.entity.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { NotificationOutboxService } from './notification-outbox.service.js';

export type NotifySummary = { sent: number; failed: number; skipped: boolean };

type TelegramResponse =
  { ok?: boolean; skipped?: boolean; description?: string } | null | undefined;

/** Số thông báo lấy ra mỗi lượt gửi. */
const BATCH_SIZE = 50;

/**
 * Gửi thông báo Telegram từ hàng chờ notification_outbox. Gửi thành công thì đánh dấu sent và
 * gán events.notifiedAt; lỗi thì hẹn thử lại với khoảng chờ tăng dần.
 * Đảm bảo "ít nhất một lần": tiến trình chết sau khi Telegram nhận nhưng trước khi đánh dấu sent
 * thì thông báo có thể được gửi lại một lần.
 */
@Injectable()
export class EventNotifierService {
  private readonly logger = new Logger(EventNotifierService.name);
  private notifying: Promise<NotifySummary> | null = null;

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly telegramService: TelegramService,
    private readonly outbox: NotificationOutboxService,
  ) {}

  async notifyPendingEvents(pauseMs = 800): Promise<NotifySummary> {
    // Chống chạy chồng trong cùng process; giữa các process do khóa dòng của outbox lo.
    if (this.notifying) return this.notifying;
    this.notifying = this.sendPending(pauseMs).finally(() => {
      this.notifying = null;
    });
    return this.notifying;
  }

  private async sendPending(pauseMs: number): Promise<NotifySummary> {
    const summary: NotifySummary = { sent: 0, failed: 0, skipped: false };
    const claimed = await this.outbox.claimDue(BATCH_SIZE);
    if (claimed.length === 0) return summary;

    const events = await this.eventRepository.find({
      where: { id: In(claimed.map((c) => c.eventId)) },
    });
    const byId = new Map(events.map((e) => [e.id, e]));

    for (let i = 0; i < claimed.length; i += 1) {
      const job = claimed[i];
      const event = byId.get(job.eventId);
      if (!event) {
        // Bài đã bị xóa (outbox xóa theo cascade) giữa lúc lấy và lúc gửi.
        await this.outbox.markFailed(
          job.id,
          job.attempts,
          'Bài không còn tồn tại',
        );
        continue;
      }
      const result = await this.notifyTelegram(event);
      if (result.outcome === 'skipped') {
        // Chưa cấu hình hoặc đang tắt: trả các dòng còn lại về hàng chờ, không tính lần thử.
        summary.skipped = true;
        await this.outbox.release(claimed.slice(i).map((c) => c.id));
        break;
      }
      if (result.outcome === 'sent') {
        await this.outbox.markSent(job.id);
        await this.eventRepository.update(event.id, { notifiedAt: new Date() });
        summary.sent += 1;
      } else {
        await this.outbox.markFailed(job.id, job.attempts, result.error);
        summary.failed += 1;
      }
      // Nghỉ giữa các lần gửi để tránh bị Telegram giới hạn tốc độ
      if (pauseMs > 0)
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
    if (summary.failed > 0) {
      this.logger.warn(
        `Telegram: ${summary.failed} thông báo gửi lỗi, sẽ thử lại sau.`,
      );
    }
    return summary;
  }

  /** Nội dung crawl không đáng tin: escape HTML, chỉ đưa link http(s) vào tin nhắn. */
  static buildTelegramMessage(event: Event): string {
    const formattedDate = event.eventDate
      ? new Date(event.eventDate).toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Asia/Ho_Chi_Minh',
        })
      : '';
    const safeUrl = /^https?:\/\//i.test(event.url || '') ? event.url : '';

    const createdBy =
      event.origin === 'manual' && typeof event.rawData?.createdBy === 'string'
        ? event.rawData.createdBy
        : '';
    const lines = [
      '<b>🔔 SỰ KIỆN ĐỐI THỦ MỚI</b>',
      // Bài nhập tay ghi rõ người nhập để không bị hiểu nhầm là bài crawl được.
      event.origin === 'manual'
        ? `📝 <i>Nhập tay${createdBy ? ` bởi ${escapeHtml(createdBy)}` : ''}</i>`
        : '',
      `<b>Thương hiệu:</b> ${escapeHtml(event.sourceName)}`,
      `<b>Tiêu đề:</b> ${escapeHtml(event.title)}`,
      `<b>Loại sự kiện:</b> ${escapeHtml(event.type)}`,
      formattedDate ? `<b>Thời gian:</b> ${formattedDate}` : '',
      safeUrl ? `<b>Chi tiết:</b> ${escapeHtml(safeUrl)}` : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private async notifyTelegram(
    event: Event,
  ): Promise<
    | { outcome: 'sent' }
    | { outcome: 'skipped' }
    | { outcome: 'failed'; error: string }
  > {
    const msg = EventNotifierService.buildTelegramMessage(event);
    try {
      const image =
        event.image && /^https?:\/\//i.test(event.image) ? event.image : null;
      let response: TelegramResponse = image
        ? await this.telegramService.sendPhoto(image, msg)
        : await this.telegramService.sendMessage(msg);
      if (response?.skipped) return { outcome: 'skipped' };
      if (!response?.ok && image) {
        // Ảnh hỏng hoặc hết hạn: gửi lại dạng chữ để không mất thông báo.
        this.logger.warn(
          `Telegram sendPhoto lỗi cho event ${event.id}: ${response?.description ?? 'unknown'}; gửi dạng chữ.`,
        );
        response = await this.telegramService.sendMessage(msg);
      }
      if (response?.ok) return { outcome: 'sent' };
      const error = response?.description ?? 'unknown';
      this.logger.warn(`Telegram gửi lỗi cho event ${event.id}: ${error}`);
      return { outcome: 'failed', error };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Telegram gửi lỗi cho event ${event.id}: ${error}`);
      return { outcome: 'failed', error };
    }
  }
}

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
