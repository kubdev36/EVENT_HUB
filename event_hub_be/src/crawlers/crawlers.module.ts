import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ClassifierService } from '../classifier/classifier.service.js';
import { CrawlerRun } from './entity/crawler-run.entity.js';
import { Event } from '../events/entity/event.entity.js';
import { Setting } from '../settings/entity/setting.entity.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { CrawlerController } from './controller/crawler.controller.js';
import { CrawlerCronService } from './crawler-cron.service.js';
import { CrawlerService } from './service/crawler.service.js';
import { CrawlLockService } from './service/crawl-lock.service.js';
import { CrawlerHttpClient } from './engine/crawler-http.client.js';
import { GenericRssEngine } from './engine/generic-rss.engine.js';
import { GenericApiEngine } from './engine/generic-api.engine.js';
import { GenericHtmlEngine } from './engine/generic-html.engine.js';
import { GenericMetaAdsEngine } from './engine/generic-meta-ads.engine.js';
import { ImagesModule } from '../images/images.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CrawlQueueService } from '../queue/crawl-queue.service.js';
import { ImageStoreService } from '../images/image-store.service.js';
import { EventNotifierService } from '../notifications/event-notifier.service.js';
import { CrawlSourceReader } from './sources/crawl-source.reader.js';
import { CrawlPipeline } from './pipeline/crawl-pipeline.service.js';
import { EventUpsertService } from './persistence/event-upsert.service.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Event, CrawlerRun, Setting]),
    AuthModule,
    ImagesModule,
    NotificationsModule,
  ],
  controllers: [CrawlerController],
  providers: [
    CrawlerService,
    CrawlLockService,
    CrawlerCronService,
    ClassifierService,
    TelegramService,
    CrawlerHttpClient,
    GenericRssEngine,
    GenericApiEngine,
    GenericHtmlEngine,
    GenericMetaAdsEngine,
    ImageStoreService,
    EventNotifierService,
    CrawlSourceReader,
    CrawlPipeline,
    EventUpsertService,
    CrawlQueueService,
  ],
  exports: [CrawlerService, CrawlQueueService],
})
export class CrawlersModule {}
