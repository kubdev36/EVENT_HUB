import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CrawlersModule } from '../crawlers/crawlers.module.js';
import { SettingsController } from './controller/settings.controller.js';
import { Setting } from './entity/setting.entity.js';
import { SettingsService } from './service/settings.service.js';

import { TelegramService } from '../telegram/telegram.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Setting]), AuthModule, CrawlersModule],
  controllers: [SettingsController],
  providers: [SettingsService, TelegramService],
})
export class SettingsModule {}
