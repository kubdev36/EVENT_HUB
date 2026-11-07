import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Event } from '../events/entity/event.entity.js';
import { TelegramService } from '../telegram/telegram.service.js';

export type NotifySummary = { sent: number; failed: number; skipped: boolean };

type TelegramResponse =
  { ok?: boolean; skipped?: boolean; description?: string } | null | undefined;

/**
 * Gửi thông báo Telegram cho bài mới. Chỉ gán notifiedAt khi Telegram xác nhận gửi thành công;
 * gửi lỗi thì bài vẫn chờ để lần sau gửi lại. Bài chưa rõ ngày đăng không được gửi.
 */
@Injectable()
export class EventNotifierService {
  private readonly logger = new Logger(EventNotifierService.name);
  private notifying: Promise<NotifySummary> | null = null;

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly telegramService: TelegramService,
  ) {}

  async notifyPendingEvents(pauseMs = 800): Promise<NotifySummary> {
    // Chống chạy chồng: cron và lần cào bấm tay dùng chung một lượt gửi, không gửi trùng.
    if (this.notifying) return this.notifying;
    this.notifying = this.sendPending(pauseMs).finally(() => {
      this.notifying = null;
    });
    return this.notifying;
  }

  private async sendPending(pauseMs: number): Promise<NotifySummary> {
    const unnotifiedEvents = await this.eventRepository.find({
      where: { notifiedAt: IsNull(), dateUnknown: false },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    const summary: NotifySummary = { sent: 0, failed: 0, skipped: false };
    for (const event of unnotifiedEvents) {
      const outcome = await this.notifyTelegram(event);
      if (outcome === 'skipped') {
        // Chưa cấu hình hoặc đang tắt: dừng, giữ nguyên các event chờ.
        summary.skipped = true;
        break;
      }
      if (outcome === 'sent') {
        event.notifiedAt = new Date();
        await this.eventRepository.save(event);
        summary.sent += 1;
      } else {
        summary.failed += 1;
      }
      // Nghỉ giữa các lần gửi để tránh bị Telegram giới hạn tốc độ
      if (pauseMs > 0)
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
    if (summary.failed > 0) {
      this.logger.warn(
        `Telegram: ${summary.failed} event gửi lỗi, sẽ thử lại lần sau.`,
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

    const lines = [
      '<b>🔔 SỰ KIỆN ĐỐI THỦ MỚI</b>',
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
  ): Promise<'sent' | 'failed' | 'skipped'> {
    const msg = EventNotifierService.buildTelegramMessage(event);
    try {
      const image =
        event.image && /^https?:\/\//i.test(event.image) ? event.image : null;
      let response: TelegramResponse = image
        ? await this.telegramService.sendPhoto(image, msg)
        : await this.telegramService.sendMessage(msg);
      if (response?.skipped) return 'skipped';
      if (!response?.ok && image) {
        // Ảnh hỏng hoặc hết hạn: gửi lại dạng chữ để không mất thông báo.
        this.logger.warn(
          `Telegram sendPhoto lỗi cho event ${event.id}: ${response?.description ?? 'unknown'}; gửi dạng chữ.`,
        );
        response = await this.telegramService.sendMessage(msg);
      }
      if (response?.ok) return 'sent';
      this.logger.warn(
        `Telegram gửi lỗi cho event ${event.id}: ${response?.description ?? 'unknown'}`,
      );
      return 'failed';
    } catch (err) {
      this.logger.warn(
        `Telegram gửi lỗi cho event ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'failed';
    }
  }
}

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
