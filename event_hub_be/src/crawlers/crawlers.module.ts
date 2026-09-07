import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ClassifierService } from '../classifier/classifier.service.js';
import { CrawlerRun } from '../crawler-runs/entity/crawler-run.entity.js';
import { CrawlerSource } from '../crawler-sources/entity/crawler-source.entity.js';
import { Event } from '../events/entity/event.entity.js';
import { Setting } from '../settings/entity/setting.entity.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { CrawlerController } from './controller/crawler.controller.js';
import { CrawlerCronService } from './crawler-cron.service.js';
import { CrawlerService } from './service/crawler.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([Event, CrawlerRun, CrawlerSource, Setting]), AuthModule],
  controllers: [CrawlerController],
  providers: [CrawlerService, CrawlerCronService, ClassifierService, TelegramService],
  exports: [CrawlerService],
})
export class CrawlersModule {}
