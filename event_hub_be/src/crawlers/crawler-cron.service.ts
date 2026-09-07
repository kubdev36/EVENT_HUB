import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrawlerService } from './service/crawler.service.js';

@Injectable()
export class CrawlerCronService {
  constructor(private readonly crawlerService: CrawlerService) {}

  @Cron('0 0 */6 * * *')
  async handleCron() {
    await this.crawlerService.crawlAllTargets();
  }
}
