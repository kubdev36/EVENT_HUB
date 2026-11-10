import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { CrawlerService } from '../crawlers/service/crawler.service.js';
import { runsWorker } from './process-role.js';

export const CRAWL_QUEUE = 'crawl-source';
/** Số nguồn cào cùng lúc trong một worker. Request tới cùng domain vẫn xếp hàng trong CrawlerHttpClient. */
const WORKER_CONCURRENCY = 4;

/** Cấu hình hàng đợi crawl (chính sách "stately" chỉ đặt được lúc tạo). */
export const QUEUE_OPTIONS = {
  // Lượt cào chạy quá 20 phút coi như chết; việc được chạy lại.
  expireInSeconds: 20 * 60,
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  // Giữ lịch sử việc đã xong 7 ngày để tra cứu.
  deleteAfterSeconds: 7 * 24 * 3600,
};

type CrawlJob = { sourceId: string };
/** at: thời điểm xếp hàng theo giờ server, để giao diện biết lượt cào nào bắt đầu sau lần bấm. */
export type EnqueueResult = {
  queued: string[];
  alreadyQueued: string[];
  at: string;
};

/**
 * Hàng đợi crawl bằng pg-boss (lưu trong Postgres, schema "pgboss", không cần dịch vụ thêm).
 * Chính sách "stately" + singletonKey = id nguồn: mỗi nguồn có tối đa một việc đang chờ và một
 * việc đang chạy. Worker chết giữa chừng thì việc hết hạn sau expireInSeconds và được chạy lại.
 */
@Injectable()
export class CrawlQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(CrawlQueueService.name);
  private readonly boss: PgBoss;
  private started: Promise<void> | null = null;

  constructor(
    config: ConfigService,
    private readonly crawler: CrawlerService,
  ) {
    this.boss = new PgBoss({
      host: config.get<string>('DB_HOST'),
      port: Number(config.get<string>('DB_PORT')),
      user: config.get<string>('DB_USERNAME'),
      password: config.get<string>('DB_PASSWORD'),
      database: config.get<string>('DB_NAME'),
      schema: 'pgboss',
      max: 4,
    });
    // pg-boss phát lỗi qua sự kiện; không nghe thì lỗi làm sập tiến trình.
    this.boss.on('error', (err: Error) =>
      this.logger.error(`pg-boss: ${err.message}`),
    );
  }

  onModuleInit() {
    this.started = this.start();
    return this.started;
  }

  private async start() {
    await this.boss.start();
    const exists = await this.boss.getQueue(CRAWL_QUEUE);
    if (!exists) {
      await this.boss.createQueue(CRAWL_QUEUE, {
        policy: 'stately',
        ...QUEUE_OPTIONS,
      });
    } else {
      // Hàng đợi đã có (lần chạy trước): áp lại cấu hình trong code để đổi cấu hình có hiệu lực.
      await this.boss.updateQueue(CRAWL_QUEUE, QUEUE_OPTIONS);
    }
    if (runsWorker()) {
      await this.boss.work<CrawlJob>(
        CRAWL_QUEUE,
        { localConcurrency: WORKER_CONCURRENCY, batchSize: 1 },
        async ([job]) => this.handle(job.data),
      );
      this.logger.log(`Worker đang nhận việc từ hàng đợi ${CRAWL_QUEUE}`);
    }
  }

  /** Xử lý một việc: lỗi tải trang đã được ghi vào crawler_runs; lỗi bất ngờ ném ra để pg-boss thử lại. */
  private async handle({ sourceId }: CrawlJob) {
    const result = await this.crawler.crawlTargetById(sourceId);
    return { status: result.status, newItems: result.newItems };
  }

  /** Đẩy việc cào cho các nguồn. Nguồn đã có việc đang chờ thì không thêm việc trùng. */
  async enqueue(sourceIds: string[]): Promise<EnqueueResult> {
    await this.started;
    const result: EnqueueResult = {
      queued: [],
      alreadyQueued: [],
      at: new Date().toISOString(),
    };
    for (const sourceId of sourceIds) {
      const id = await this.boss.send(
        CRAWL_QUEUE,
        { sourceId },
        { singletonKey: sourceId },
      );
      (id ? result.queued : result.alreadyQueued).push(sourceId);
    }
    return result;
  }

  /** Dừng nhận việc mới, chờ việc đang chạy xong (tối đa 30 giây) rồi đóng kết nối. */
  async onApplicationShutdown() {
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }
}
