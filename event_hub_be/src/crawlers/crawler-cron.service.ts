import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrawlerService } from './service/crawler.service.js';

@Injectable()
export class CrawlerCronService {
  constructor(private readonly crawlerService: CrawlerService) {}

  // 1. Quét cào dữ liệu ngầm mỗi 15 phút để gom bài viết mới vào Database
  @Cron('0 */15 * * * *')
  async handleCrawlerCron() {
    await this.crawlerService.crawlAllTargets();
  }

  // 2. Bắn sự kiện mới sang Telegram định kỳ 6 tiếng / lần
  @Cron('0 0 */6 * * *')
  async handleTelegramNotificationCron() {
    await this.crawlerService.notifyPendingEvents();
  }
}

