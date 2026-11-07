import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Khóa để mỗi nguồn chỉ có một lượt cào tại một thời điểm, kể cả giữa nhiều process
 * (cron, bấm tay, worker sau này). Dùng Postgres advisory lock theo phiên trên một
 * kết nối riêng; process chết thì Postgres tự nhả khóa khi kết nối đóng.
 */
@Injectable()
export class CrawlLockService {
  private readonly logger = new Logger(CrawlLockService.name);
  /** Đường tắt trong cùng process, tránh mở kết nối khi biết chắc đang chạy. */
  private readonly running = new Set<string>();

  constructor(private readonly dataSource: DataSource) {}

  /** Chạy fn nếu lấy được khóa; nếu nguồn đang được cào ở nơi khác thì trả { acquired: false }. */
  async runExclusive<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    if (this.running.has(key)) return { acquired: false };
    this.running.add(key);
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      const rows: Array<{ locked: boolean }> = await runner.query(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
        [`crawl:${key}`],
      );
      if (!rows[0]?.locked) return { acquired: false };
      try {
        return { acquired: true, value: await fn() };
      } finally {
        await runner
          .query(`SELECT pg_advisory_unlock(hashtext($1))`, [`crawl:${key}`])
          .catch((err: unknown) =>
            // Không nhả được thì khóa tự mất khi kết nối đóng ở release() bên dưới.
            this.logger.warn(`Không nhả được khóa ${key}: ${String(err)}`),
          );
      }
    } finally {
      this.running.delete(key);
      await runner.release();
    }
  }
}
