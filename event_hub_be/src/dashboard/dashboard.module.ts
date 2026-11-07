import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CrawlerRun } from '../crawlers/entity/crawler-run.entity.js';
import { Event } from '../events/entity/event.entity.js';
import { EventsModule } from '../events/events.module.js';
import { Setting } from '../settings/entity/setting.entity.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, CrawlerRun, Setting]),
    AuthModule,
    EventsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
