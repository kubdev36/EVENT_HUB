import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './users/entity/user.entity.js';
import { Event } from './events/entity/event.entity.js';
import { CrawlerRun } from './crawlers/entity/crawler-run.entity.js';
import { Setting } from './settings/entity/setting.entity.js';
import { AuditLog } from './audit/audit-log.entity.js';
import { RefreshToken } from './auth/refresh-token.entity.js';
import { NotificationOutbox } from './notifications/notification-outbox.entity.js';
import { migrations } from './migrations/index.js';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'event_hub',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [
    User,
    Event,
    CrawlerRun,
    Setting,
    AuditLog,
    RefreshToken,
    NotificationOutbox,
  ],
  migrations,
  subscribers: [],
});
