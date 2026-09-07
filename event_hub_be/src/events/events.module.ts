import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Event } from './entity/event.entity.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { Setting } from '../settings/entity/setting.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Event, Setting]), AuthModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
