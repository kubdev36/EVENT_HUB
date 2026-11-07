import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrawlerService } from './service/crawler.service.js';

@Injectable()
export class CrawlerCronService {
  constructor(private readonly crawlerService: CrawlerService) {}

  // 1. Mỗi 15 phút kiểm tra; chỉ cào nguồn đã đến hạn theo interval của nguồn (mặc định 6h).
  @Cron('0 */15 * * * *')
  async handleCrawlerCron() {
    await this.crawlerService.crawlDueTargets();
  }

  // 2. Bắn sự kiện mới sang Telegram định kỳ 6 tiếng / lần
  @Cron('0 0 */6 * * *')
  async handleTelegramNotificationCron() {
    await this.crawlerService.notifyPendingEvents();
  }
}
