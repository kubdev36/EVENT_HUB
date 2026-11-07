import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ImageStoreService } from '../../images/image-store.service.js';
import { EventNotifierService } from '../../notifications/event-notifier.service.js';
import { CrawlSource, CrawlTarget } from '../crawler.types.js';
import { CrawlerRun, CrawlerRunStatus } from '../entity/crawler-run.entity.js';
import { CrawlerHttpClient } from '../engine/crawler-http.client.js';
import { isDue, mapWithConcurrency } from '../helpers/schedule.helper.js';
import { EventUpsertService } from '../persistence/event-upsert.service.js';
import { CrawlPipeline } from '../pipeline/crawl-pipeline.service.js';
import { CrawlSourceReader } from '../sources/crawl-source.reader.js';
import { CrawlLockService } from './crawl-lock.service.js';

/** Số nguồn cào cùng lúc. Request tới cùng domain vẫn xếp hàng trong CrawlerHttpClient. */
const MAX_PARALLEL_SOURCES = 4;
/** Lượt cào ở trạng thái running lâu hơn mức này coi như đã chết giữa chừng. */
const STALE_RUN_MS = 30 * 60 * 1000;

export type CrawlResult = {
  sourceId: string;
  sourceName: string;
  type: string;
  itemsFound: number;
  newItems: number;
  status: CrawlerRunStatus | 'skipped';
  errorMessage?: string;
};

/**
 * Điều phối crawl: chọn nguồn (tất cả hoặc đến hạn), khóa từng nguồn, ghi lượt cào
 * (crawler_runs), gọi pipeline và ghi DB, rồi lưu ảnh và gửi thông báo.
 */
@Injectable()
export class CrawlerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(
    @InjectRepository(CrawlerRun)
    private readonly crawlerRunRepository: Repository<CrawlerRun>,
    private readonly sources: CrawlSourceReader,
    private readonly pipeline: CrawlPipeline,
    private readonly upsert: EventUpsertService,
    private readonly notifier: EventNotifierService,
    private readonly httpClient: CrawlerHttpClient,
    private readonly lockService: CrawlLockService,
    private readonly imageStore: ImageStoreService,
  ) {}

  /** Khởi động lại sau khi process chết: dọn các lượt cào bị kẹt ở running. */
  async onApplicationBootstrap() {
    await this.failStaleRuns().catch((err: unknown) =>
      this.logger.warn(`Không dọn được lượt cào bị kẹt: ${String(err)}`),
    );
  }

  /** Chuyển các lượt running quá STALE_RUN_MS thành failed. */
  async failStaleRuns(now = new Date()): Promise<number> {
    const result = await this.crawlerRunRepository.update(
      {
        status: 'running',
        startedAt: LessThan(new Date(now.getTime() - STALE_RUN_MS)),
      },
      {
        status: 'failed',
        finishedAt: now,
        errorMessage:
          'Bị gián đoạn: tiến trình dừng giữa chừng (vd. backend khởi động lại)',
      },
    );
    if (result.affected) {
      this.logger.warn(
        `Đã đánh dấu ${result.affected} lượt cào bị kẹt là failed`,
      );
    }
    return result.affected ?? 0;
  }

  /** Gửi Telegram cho bài chưa thông báo (cron gọi định kỳ). */
  notifyPendingEvents(pauseMs?: number) {
    return this.notifier.notifyPendingEvents(pauseMs);
  }

  /** Gửi thông báo ngay sau khi cào; lỗi chỉ ghi log, không làm hỏng kết quả cào. */
  private async notifyAfterCrawl() {
    try {
      await this.notifier.notifyPendingEvents();
    } catch (err) {
      this.logger.warn(
        `Gửi Telegram sau khi cào lỗi: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Bấm "Cào tất cả": cào mọi nguồn đang bật, không xét hạn. */
  async crawlAllTargets(): Promise<CrawlResult[]> {
    const targets = (await this.sources.getTargets()).filter(
      (target) => target.enabled !== false,
    );
    return this.crawlMany(targets);
  }

  /** Nguồn đang bật và đã đến hạn theo interval (dọn lượt cào bị kẹt trước). */
  async findDueTargets(now = new Date()): Promise<CrawlTarget[]> {
    await this.failStaleRuns(now);
    const targets = (await this.sources.getTargets()).filter(
      (target) => target.enabled !== false,
    );
    const lastRuns = await this.getLastRunStarts(targets.map((t) => t.id));
    return targets.filter((t) => isDue(t.interval, lastRuns.get(t.id), now));
  }

  /** Nguồn đang bật (dùng cho "Cào tất cả"). */
  async enabledTargets(): Promise<CrawlTarget[]> {
    return (await this.sources.getTargets()).filter(
      (target) => target.enabled !== false,
    );
  }

  /** Cào ngay các nguồn đến hạn trong tiến trình hiện tại (không qua hàng đợi). */
  async crawlDueTargets(now = new Date()): Promise<CrawlResult[]> {
    const targets = await this.enabledTargets();
    const due = await this.findDueTargets(now);
    if (due.length === 0) return [];
    this.logger.log(
      `Cào ${due.length}/${targets.length} nguồn đến hạn: ${due.map((t) => t.id).join(', ')}`,
    );
    return this.crawlMany(due);
  }

  private async crawlMany(targets: CrawlTarget[]): Promise<CrawlResult[]> {
    const results = await mapWithConcurrency(
      targets,
      MAX_PARALLEL_SOURCES,
      (t) => this.crawlTargetSafely(t),
    );
    await this.notifyAfterCrawl();
    return results;
  }

  /** Thời điểm bắt đầu lần cào gần nhất của từng nguồn (một truy vấn). */
  private async getLastRunStarts(ids: string[]): Promise<Map<string, Date>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ sourceId: string; last: Date }> =
      await this.crawlerRunRepository
        .createQueryBuilder('r')
        .select('r.sourceId', 'sourceId')
        .addSelect('MAX(r.startedAt)', 'last')
        .where('r.sourceId IN (:...ids)', { ids })
        .groupBy('r.sourceId')
        .getRawMany();
    return new Map(rows.map((r) => [r.sourceId, new Date(r.last)]));
  }

  async getRecentRuns(limit = 50) {
    return this.crawlerRunRepository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async crawlSource(source: CrawlSource) {
    const result = await this.crawlTarget(source);
    await this.notifyAfterCrawl();
    return result;
  }

  async crawlTargetById(id: string) {
    const target = await this.sources.getTargetById(id);
    const result = await this.crawlTarget(target);
    await this.notifyAfterCrawl();
    return result;
  }

  /** Cào một nguồn. Nếu nguồn đang được cào ở nơi khác thì bỏ qua (status = skipped). */
  async crawlTarget(target: CrawlTarget): Promise<CrawlResult> {
    const locked = await this.lockService.runExclusive(target.id, () =>
      this.crawlTargetLocked(target),
    );
    if (locked.acquired) return locked.value;
    this.logger.warn(`Bỏ qua ${target.id}: nguồn đang được cào ở nơi khác`);
    return {
      sourceId: target.id,
      sourceName: target.name,
      type: target.type || 'web',
      itemsFound: 0,
      newItems: 0,
      status: 'skipped',
      errorMessage: 'Nguồn đang được cào, bỏ qua lượt này',
    };
  }

  private async crawlTargetLocked(target: CrawlTarget): Promise<CrawlResult> {
    const hosts = this.applyRateLimits(target);
    const startedMs = Date.now();
    const requestsBefore = this.httpClient.requestCountFor(hosts);
    const run = await this.crawlerRunRepository.save(
      this.crawlerRunRepository.create({
        sourceId: target.id,
        sourceName: target.name,
        status: 'running',
        startedAt: new Date(),
        itemsFound: 0,
        newItems: 0,
        errorMessage: null,
      }),
    );

    try {
      const { items, errors, attempts } = await this.pipeline.fetch(target);
      const validItems = this.pipeline.filter(target, items);
      const rules = await this.sources.getKeywordRules();
      const existing = await this.upsert.loadExisting(target.id);
      const prepared = this.pipeline.prepare(
        target,
        validItems,
        rules,
        existing,
      );
      await this.pipeline.enrichFromDetails(target, prepared);
      const newItemsCount = await this.upsert.persist(target, prepared);

      const status = CrawlPipeline.resolveRunStatus(errors, attempts);
      run.status = status;
      run.errorMessage = errors.length
        ? errors
            .map((e) => e.message)
            .join('; ')
            .slice(0, 2000)
        : null;
      run.itemsFound = validItems.length;
      run.newItems = newItemsCount;
      this.finishRun(run, startedMs, requestsBefore, hosts);
      await this.crawlerRunRepository.save(run);
      this.storeImagesInBackground(target);

      return {
        sourceId: target.id,
        sourceName: target.name,
        type: target.type || 'web',
        itemsFound: validItems.length,
        newItems: newItemsCount,
        status,
        ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
      };
    } catch (error) {
      run.status = 'failed';
      run.errorMessage =
        error instanceof Error ? error.message : 'Unknown crawler error';
      this.finishRun(run, startedMs, requestsBefore, hosts);
      await this.crawlerRunRepository.save(run);
      throw error;
    }
  }

  /** Lưu ảnh thu nhỏ sau lần cào, không chờ và không làm hỏng kết quả cào. Lỗi được ghi log. */
  private storeImagesInBackground(target: CrawlTarget): void {
    this.imageStore
      .storeForTarget(target)
      .catch((err: unknown) =>
        this.logger.warn(
          `Lưu ảnh cho ${target.id} lỗi: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /** Các host nguồn gọi tới; đặt khoảng cách tối thiểu theo cấu hình nguồn (vd. Crawl-delay). */
  private applyRateLimits(target: CrawlTarget): string[] {
    const hosts = [
      ...(target.targetUrls || []),
      ...(target.api?.endpoint ? [target.api.endpoint] : []),
      ...(target.ajaxEndpoint ? [target.ajaxEndpoint] : []),
    ]
      .filter((u) => /^https?:\/\//i.test(u?.trim() || ''))
      .map((u) => CrawlerHttpClient.hostKey(u.trim()));
    const unique = [...new Set(hosts)];
    if (target.minRequestIntervalMs !== undefined) {
      for (const h of unique)
        this.httpClient.setHostInterval(h, target.minRequestIntervalMs);
    }
    return unique;
  }

  private finishRun(
    run: CrawlerRun,
    startedMs: number,
    requestsBefore: number,
    hosts: string[],
  ) {
    run.finishedAt = new Date();
    run.durationMs = Date.now() - startedMs;
    run.requestCount = this.httpClient.requestCountFor(hosts) - requestsBefore;
    // Log JSON một dòng để đo (thời gian, số request, số item theo nguồn).
    this.logger.log(
      JSON.stringify({
        event: 'crawl_run',
        runId: run.id,
        sourceId: run.sourceId,
        status: run.status,
        durationMs: run.durationMs,
        requestCount: run.requestCount,
        itemsFound: run.itemsFound,
        newItems: run.newItems,
      }),
    );
  }

  private async crawlTargetSafely(target: CrawlTarget): Promise<CrawlResult> {
    try {
      return await this.crawlTarget(target);
    } catch (error) {
      return {
        sourceId: target.id,
        sourceName: target.name,
        type: target.type || 'web',
        itemsFound: 0,
        newItems: 0,
        status: 'failed',
        errorMessage:
          error instanceof Error ? error.message : 'Unknown crawler error',
      };
    }
  }
}
