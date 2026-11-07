import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CrawlersModule } from './crawlers/crawlers.module.js';
import { EventsModule } from './events/events.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { UsersModule } from './users/users.module.js';
import { migrations } from './migrations/index.js';
import { validateEnv } from './config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        autoLoadEntities: true,
        // Schema chỉ đổi bằng migration, không dùng synchronize.
        synchronize: false,
        migrations,
        // Tự chạy migration khi khởi động; đặt DB_MIGRATIONS_RUN=false để tắt.
        migrationsRun:
          configService.get<string>('DB_MIGRATIONS_RUN') !== 'false',
      }),
    }),
    AuthModule,
    UsersModule,
    SettingsModule,
    CrawlersModule,
    EventsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
