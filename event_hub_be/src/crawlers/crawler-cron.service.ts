import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrawlQueueService } from '../queue/crawl-queue.service.js';
import { runsWorker } from '../queue/process-role.js';
import { CrawlerService } from './service/crawler.service.js';

/** Lịch định kỳ. Chỉ chạy ở tiến trình worker (hoặc "all"); tiến trình api bỏ qua. */
@Injectable()
export class CrawlerCronService {
  private readonly logger = new Logger(CrawlerCronService.name);
  private readonly enabled = runsWorker();

  constructor(
    private readonly crawlerService: CrawlerService,
    private readonly queue: CrawlQueueService,
  ) {}

  // Mỗi 15 phút: đẩy các nguồn đã đến hạn (theo interval của nguồn) vào hàng đợi.
  @Cron('0 */15 * * * *')
  async handleCrawlerCron() {
    if (!this.enabled) return;
    const due = await this.crawlerService.findDueTargets();
    if (due.length === 0) return;
    const r = await this.queue.enqueue(due.map((t) => t.id));
    this.logger.log(
      `Đẩy ${r.queued.length} nguồn đến hạn vào hàng đợi${r.alreadyQueued.length ? `, ${r.alreadyQueued.length} nguồn đã có việc chờ` : ''}`,
    );
  }

  // Mỗi phút: gửi các thông báo đến hạn trong outbox (gồm cả lần thử lại).
  @Cron('0 * * * * *')
  async handleTelegramNotificationCron() {
    if (!this.enabled) return;
    await this.crawlerService.notifyPendingEvents();
  }
}
