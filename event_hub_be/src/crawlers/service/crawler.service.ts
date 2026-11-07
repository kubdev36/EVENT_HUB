import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { ClassifierService } from '../../classifier/classifier.service.js';
import { Event } from '../../events/entity/event.entity.js';
import { Setting } from '../../settings/entity/setting.entity.js';
import { TelegramService } from '../../telegram/telegram.service.js';
import {
  CrawlSource,
  CrawlTarget,
  KeywordRule,
  ParsedCrawlItem,
} from '../crawler.types.js';
import { CrawlerRun, CrawlerRunStatus } from '../entity/crawler-run.entity.js';
import {
  CrawlerHttpClient,
  CrawlFetchError,
} from '../engine/crawler-http.client.js';
import { GenericRssEngine } from '../engine/generic-rss.engine.js';
import { GenericApiEngine } from '../engine/generic-api.engine.js';
import { GenericHtmlEngine } from '../engine/generic-html.engine.js';
import { GenericMetaAdsEngine } from '../engine/generic-meta-ads.engine.js';
import { ArticleDetailHelper } from '../helpers/article-detail.helper.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';
import { isDue, mapWithConcurrency } from '../helpers/schedule.helper.js';
import { CrawlLockService } from './crawl-lock.service.js';
import { ImageStoreService } from '../../images/image-store.service.js';

/** Event có ngày đăng trước mốc này bị bỏ qua (dữ liệu cũ). */
const MIN_EVENT_DATE = new Date('2025-01-01T00:00:00+07:00');
/** Số nguồn cào cùng lúc. Request tới cùng domain vẫn xếp hàng trong CrawlerHttpClient. */
const MAX_PARALLEL_SOURCES = 4;
/** Lượt cào ở trạng thái running lâu hơn mức này coi như đã chết giữa chừng. */
const STALE_RUN_MS = 30 * 60 * 1000;
/** Số trang chi tiết mặc định mỗi lần cào một nguồn. */
const DEFAULT_DETAIL_BUDGET = 10;
const WRITE_CHUNK = 100;

export type CrawlResult = {
  sourceId: string;
  sourceName: string;
  type: string;
  itemsFound: number;
  newItems: number;
  status: CrawlerRunStatus | 'skipped';
  errorMessage?: string;
};

/** Các cột crawler được phép cập nhật trên event đã có. */
type EventPatch = Partial<
  Pick<
    Event,
    | 'title'
    | 'description'
    | 'image'
    | 'imageStoredPath'
    | 'imageStoredAt'
    | 'imageStoreStatus'
    | 'eventDate'
    | 'eventTime'
    | 'dateUnknown'
    | 'externalId'
    | 'type'
  >
>;

type PreparedItem = {
  item: ParsedCrawlItem;
  type: string;
  contentHash: string;
  externalId: string | null;
  existing: Event | null;
};

@Injectable()
export class CrawlerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CrawlerService.name);
  private notifying: Promise<{
    sent: number;
    failed: number;
    skipped: boolean;
  }> | null = null;

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(CrawlerRun)
    private readonly crawlerRunRepository: Repository<CrawlerRun>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly classifierService: ClassifierService,
    private readonly telegramService: TelegramService,
    private readonly rssEngine: GenericRssEngine,
    private readonly apiEngine: GenericApiEngine,
    private readonly htmlEngine: GenericHtmlEngine,
    private readonly metaAdsEngine: GenericMetaAdsEngine,
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

  /**
   * Gửi Telegram cho event chưa thông báo. Chỉ gán notifiedAt khi Telegram xác nhận gửi thành công;
   * gửi lỗi thì event vẫn chờ để lần sau gửi lại. Event chưa rõ ngày đăng không được gửi.
   */
  async notifyPendingEvents(pauseMs = 800) {
    // Chống chạy chồng: cron và lần cào bấm tay dùng chung một lượt gửi, không gửi trùng.
    if (this.notifying) return this.notifying;
    this.notifying = this.sendPending(pauseMs).finally(() => {
      this.notifying = null;
    });
    return this.notifying;
  }

  /** Gửi thông báo ngay sau khi cào; lỗi chỉ ghi log, không làm hỏng kết quả cào. */
  private async notifyAfterCrawl() {
    try {
      await this.notifyPendingEvents();
    } catch (err) {
      this.logger.warn(
        `Gửi Telegram sau khi cào lỗi: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async sendPending(pauseMs: number) {
    const unnotifiedEvents = await this.eventRepository.find({
      where: { notifiedAt: IsNull(), dateUnknown: false },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    const summary = { sent: 0, failed: 0, skipped: false };
    for (const event of unnotifiedEvents) {
      const outcome = await this.notifyTelegram(event);
      if (outcome === 'skipped') {
        // Chưa cấu hình hoặc đang tắt: dừng, giữ nguyên các event chờ.
        summary.skipped = true;
        break;
      }
      if (outcome === 'sent') {
        event.notifiedAt = new Date();
        await this.eventRepository.save(event);
        summary.sent += 1;
      } else {
        summary.failed += 1;
      }
      // Nghỉ giữa các lần gửi để tránh bị Telegram giới hạn tốc độ
      if (pauseMs > 0)
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
    if (summary.failed > 0) {
      this.logger.warn(
        `Telegram: ${summary.failed} event gửi lỗi, sẽ thử lại lần sau.`,
      );
    }
    return summary;
  }

  /** Bấm "Cào tất cả": cào mọi nguồn đang bật, không xét hạn. */
  async crawlAllTargets(): Promise<CrawlResult[]> {
    const targets = (await this.getCrawlerTargets()).filter(
      (target) => target.enabled !== false,
    );
    return this.crawlMany(targets);
  }

  /** Cron: chỉ cào nguồn đang bật và đã đến hạn theo interval. */
  async crawlDueTargets(now = new Date()): Promise<CrawlResult[]> {
    await this.failStaleRuns(now);
    const targets = (await this.getCrawlerTargets()).filter(
      (target) => target.enabled !== false,
    );
    const lastRuns = await this.getLastRunStarts(targets.map((t) => t.id));
    const due = targets.filter((t) =>
      isDue(t.interval, lastRuns.get(t.id), now),
    );
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

  async crawlAllSources() {
    return this.crawlAllTargets();
  }

  async crawlSource(source: CrawlSource) {
    const result = await this.crawlTarget(source);
    await this.notifyAfterCrawl();
    return result;
  }

  async crawlSourceById(id: string) {
    return this.crawlTargetById(id);
  }

  async crawlTargetById(id: string) {
    const target = await this.getCrawlerTargetById(id);
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
      const {
        items: rawItems,
        errors,
        attempts,
      } = await this.fetchItemsFromTarget(target);
      const validItems = this.filterItems(target, rawItems);
      const prepared = await this.prepareItems(target, validItems);
      await this.enrichFromDetails(target, prepared);
      const newItemsCount = await this.persist(target, prepared);

      const status = CrawlerService.resolveRunStatus(errors, attempts);
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

  /** Bỏ bài trùng URL trong lần cào, tiêu đề nhiễu và tiêu đề khớp bộ lọc của nguồn. */
  private filterItems(
    target: CrawlTarget,
    rawItems: ParsedCrawlItem[],
  ): ParsedCrawlItem[] {
    const seen = new Set<string>();
    const exclude = CrawlerService.buildExcludePattern(target);
    const valid: ParsedCrawlItem[] = [];
    for (const item of rawItems) {
      const cleanUrl = UrlNormalizerHelper.normalizeUrl(item.url);
      if (
        !cleanUrl ||
        seen.has(cleanUrl) ||
        NoiseFilterHelper.isNoiseTitle(item.title) ||
        exclude?.test(item.title)
      )
        continue;
      seen.add(cleanUrl);
      valid.push(item);
    }
    return valid;
  }

  /** Phân loại và ghép với event đã có. Tải event của nguồn bằng một truy vấn. */
  private async prepareItems(
    target: CrawlTarget,
    items: ParsedCrawlItem[],
  ): Promise<PreparedItem[]> {
    const rules = await this.getKeywordRules();
    const existingRows = await this.eventRepository.find({
      where: { sourceId: target.id },
      // Không lấy rawData (có thể lớn).
      select: {
        id: true,
        url: true,
        contentHash: true,
        externalId: true,
        title: true,
        description: true,
        image: true,
        eventDate: true,
        eventTime: true,
        dateUnknown: true,
        type: true,
      },
    });
    const byExternalId = new Map<string, Event>();
    const byUrl = new Map<string, Event>();
    const byHash = new Map<string, Event>();
    for (const row of existingRows) {
      if (row.externalId) byExternalId.set(row.externalId, row);
      byUrl.set(row.url, row);
      byHash.set(row.contentHash, row);
    }

    const prepared: PreparedItem[] = [];
    for (const item of items) {
      const type = this.classifierService.classify(
        item.title,
        item.description || '',
        rules,
      );
      if (!type) continue;
      const contentHash = UrlNormalizerHelper.buildContentHash(
        target.id,
        item.url,
        item.title,
      );
      const externalId = item.externalId ?? null;
      const existing =
        (externalId ? byExternalId.get(externalId) : undefined) ??
        byUrl.get(item.url) ??
        byHash.get(contentHash) ??
        null;
      prepared.push({ item, type, contentHash, externalId, existing });
    }
    return prepared;
  }

  /**
   * Crawl hai bước, chỉ cho bài cần: bài mới thiếu ảnh, hoặc (khi nguồn bật fetchDetail)
   * bài chưa có ngày từ dữ liệu có cấu trúc. Ưu tiên bài mới; có giới hạn mỗi lần.
   */
  private async enrichFromDetails(
    target: CrawlTarget,
    prepared: PreparedItem[],
  ): Promise<void> {
    const fetchDetail = Boolean(target.extract?.fetchDetail);
    const budget = Math.min(
      Math.max(target.extract?.maxDetailPerRun ?? DEFAULT_DETAIL_BUDGET, 0),
      50,
    );
    const delayMs = Math.max(target.extract?.detailDelayMs ?? 0, 0);
    const now = Date.now();

    const needDetail = prepared
      .filter((p) => {
        const needImage = !p.existing && !p.item.image;
        // Chỉ tin ngày do engine lấy từ dữ liệu có cấu trúc; ngày đoán từ tiêu đề không tính.
        const needDate =
          fetchDetail &&
          !p.item.eventDate &&
          (!p.existing ||
            p.existing.dateUnknown ||
            // Ngày cũ nằm ở tương lai là ngày sai (vd. hạn khuyến mãi), cần lấy lại.
            (p.existing.eventDate !== null &&
              new Date(p.existing.eventDate).getTime() > now + 86_400_000));
        return needImage || needDate;
      })
      .sort((a, b) => Number(Boolean(a.existing)) - Number(Boolean(b.existing)))
      .slice(0, budget);

    for (const p of needDetail) {
      await this.enrichFromDetail(p.item, delayMs, fetchDetail);
    }
  }

  /**
   * Ghi DB theo lô: bài mới insert theo từng 100 dòng; bài đã có chỉ update cột thay đổi;
   * lastSeenAt của mọi bài đã thấy cập nhật bằng một truy vấn. Trả số bài mới.
   */
  private async persist(
    target: CrawlTarget,
    prepared: PreparedItem[],
  ): Promise<number> {
    const now = new Date();
    const seenIds: string[] = [];
    const newEvents: Event[] = [];
    const newHashes = new Set<string>();

    for (const { item, type, contentHash, externalId, existing } of prepared) {
      const dateInfo = DateExtractorHelper.parseItemEventDate(item);
      const image =
        item.image && !NoiseFilterHelper.isNoiseImage(item.image)
          ? item.image
          : null;

      if (existing) {
        seenIds.push(existing.id);
        const patch = CrawlerService.diffExisting(existing, {
          item,
          type,
          externalId,
          image,
          dateInfo,
        });
        if (Object.keys(patch).length > 0) {
          await this.eventRepository.update(existing.id, patch);
          Object.assign(existing, patch);
        }
        continue;
      }

      // Không tìm được ngày đăng thì để trống và đánh dấu dateUnknown, không dùng ngày crawl.
      const eventDate =
        dateInfo.date && !isNaN(dateInfo.date.getTime()) ? dateInfo.date : null;
      if (eventDate && eventDate < MIN_EVENT_DATE) continue;
      // Hai bài khác URL nhưng cùng contentHash trong một lần cào: chỉ giữ bài đầu.
      if (newHashes.has(contentHash)) continue;
      newHashes.add(contentHash);

      newEvents.push(
        this.eventRepository.create({
          sourceId: target.id,
          sourceName: target.name,
          origin: 'crawler',
          sourceUrl: (item.rawData?.sourceUrl as string) || item.url,
          title: item.title,
          description: item.description ?? null,
          image,
          url: item.url,
          eventDate,
          eventTime: eventDate ? dateInfo.time : null,
          dateUnknown: !eventDate,
          externalId,
          type,
          rawData: item.rawData ?? null,
          contentHash,
          firstSeenAt: now,
          lastSeenAt: now,
          notifiedAt: null,
        }),
      );
    }

    if (newEvents.length > 0) {
      await this.eventRepository.save(newEvents, { chunk: WRITE_CHUNK });
    }
    for (let i = 0; i < seenIds.length; i += 500) {
      await this.eventRepository.update(
        { id: In(seenIds.slice(i, i + 500)) },
        { lastSeenAt: now },
      );
    }
    return newEvents.length;
  }

  /** Các cột cần cập nhật cho event đã có; rỗng nếu không có gì đổi. */
  static diffExisting(
    existing: Event,
    next: {
      item: ParsedCrawlItem;
      type: string;
      externalId: string | null;
      image: string | null;
      dateInfo: { date: Date | null; time: string | null; isExplicit: boolean };
    },
  ): EventPatch {
    const patch: EventPatch = {};
    const { item, type, externalId, image, dateInfo } = next;
    if (item.title && item.title !== existing.title) patch.title = item.title;
    if (
      item.description !== undefined &&
      item.description !== null &&
      item.description !== existing.description
    )
      patch.description = item.description;
    if (image && image !== existing.image) {
      patch.image = image;
      // Ảnh đổi thì ảnh đã lưu không còn đúng: xóa trạng thái để lưu lại ảnh mới.
      patch.imageStoredPath = null;
      patch.imageStoredAt = null;
      patch.imageStoreStatus = null;
    }
    // Chỉ cập nhật ngày khi tìm được ngày thật từ bài.
    if (
      dateInfo.isExplicit &&
      dateInfo.date &&
      !isNaN(dateInfo.date.getTime())
    ) {
      const old = existing.eventDate
        ? new Date(existing.eventDate).getTime()
        : null;
      if (old !== dateInfo.date.getTime()) patch.eventDate = dateInfo.date;
      const time = dateInfo.time || existing.eventTime;
      if (time !== existing.eventTime) patch.eventTime = time;
      if (existing.dateUnknown) patch.dateUnknown = false;
    }
    if (externalId && !existing.externalId) patch.externalId = externalId;
    if (type !== existing.type) patch.type = type;
    return patch;
  }

  /**
   * success: không URL nào lỗi; partial: một phần lỗi; blocked: mọi phần đều bị chặn;
   * failed: mọi phần đều lỗi (có ít nhất một lỗi không phải bị chặn).
   */
  static resolveRunStatus(
    errors: CrawlFetchError[],
    attempts: number,
  ): CrawlerRunStatus {
    if (errors.length === 0) return 'success';
    if (errors.length < attempts) return 'partial';
    return errors.every((e) => e.kind === 'blocked') ? 'blocked' : 'failed';
  }

  /** Regex loại tiêu đề theo cấu hình nguồn; cấu hình sai thì ghi log và bỏ qua bộ lọc. */
  static buildExcludePattern(target: CrawlTarget): RegExp | null {
    const pattern = target.extract?.excludeTitlePattern;
    if (!pattern) return null;
    try {
      return new RegExp(pattern, 'iu');
    } catch (err) {
      new Logger(CrawlerService.name).warn(
        `excludeTitlePattern của ${target.id} không hợp lệ: ${(err as Error).message}`,
      );
      return null;
    }
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

  private async fetchItemsFromTarget(target: CrawlTarget): Promise<{
    items: ParsedCrawlItem[];
    errors: CrawlFetchError[];
    attempts: number;
  }> {
    const allItems: ParsedCrawlItem[] = [];
    const errors: CrawlFetchError[] = [];
    let attempts = 0;

    // Mỗi phần (API, từng URL) lỗi riêng; phần lỗi được ghi lại thay vì bị bỏ qua im lặng.
    const attempt = async (
      label: string,
      fn: () => Promise<ParsedCrawlItem[]>,
    ) => {
      attempts += 1;
      try {
        allItems.push(...(await fn()));
      } catch (err) {
        if (!(err instanceof CrawlFetchError)) {
          this.logger.warn(
            `Lỗi không mong đợi khi crawl ${label}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        errors.push(
          err instanceof CrawlFetchError
            ? err
            : new CrawlFetchError(
                'failed',
                label,
                err instanceof Error ? err.message : String(err),
              ),
        );
      }
    };

    // 1. API / GraphQL nếu nguồn có cấu hình
    if (this.apiEngine.appliesTo(target)) {
      await attempt(`api:${target.id}`, () =>
        this.apiEngine.fetchApiItems(target),
      );
    }

    // 2. Các URL đã cấu hình (lần lượt; giãn cách do CrawlerHttpClient lo theo domain)
    for (let url of target.targetUrls || []) {
      url = url.trim();
      if (!url) continue;

      const isFacebook =
        url.includes('facebook.com') || url.includes('ads/library');
      const isRssOrXml =
        url.includes('.rss') ||
        url.includes('.xml') ||
        url.includes('/feed') ||
        url.includes('format=Atom') ||
        url.includes('format=Mrss');

      const targetUrl = url;
      if (isFacebook) {
        await attempt(targetUrl, () =>
          this.metaAdsEngine.fetchActiveAds(targetUrl),
        );
      } else if (isRssOrXml) {
        await attempt(targetUrl, () =>
          this.rssEngine.fetchRssOrSitemap(targetUrl),
        );
      } else {
        await attempt(targetUrl, () =>
          this.htmlEngine.fetchHtmlItems(targetUrl, target.extract),
        );
      }
    }

    return { items: allItems, errors, attempts };
  }

  /**
   * Tải trang chi tiết để lấy ảnh và (nếu useDate) ngày đăng. Lỗi chỉ ghi log: bài vẫn
   * được lưu (dateUnknown nếu thiếu ngày) và sẽ thử lại ở lần cào sau.
   */
  private async enrichFromDetail(
    item: ParsedCrawlItem,
    delayMs: number,
    useDate: boolean,
  ): Promise<boolean> {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const page = await this.httpClient.fetchPage(item.url);
    if (page.kind !== 'ok') {
      this.logger.warn(
        `Không lấy được trang chi tiết ${item.url}: ${page.reason}`,
      );
      return false;
    }
    const detail = ArticleDetailHelper.parse(page.html, page.url);
    if (!item.image && detail.image) item.image = detail.image;
    if (!useDate || item.eventDate || !detail.published) return false;
    item.eventDate = detail.published.date;
    item.eventTime = detail.published.time;
    return true;
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

  private async getCrawlerTargets(): Promise<CrawlTarget[]> {
    const setting = await this.settingRepository.findOne({
      where: { key: 'crawler_sources' },
    });
    if (!setting?.value) return [];
    if (Array.isArray(setting.value)) return setting.value as CrawlTarget[];
    if (typeof setting.value === 'object') {
      const obj = setting.value as {
        targets?: CrawlTarget[];
        sources?: CrawlTarget[];
      };
      if (Array.isArray(obj.targets)) return obj.targets;
      if (Array.isArray(obj.sources)) return obj.sources;
    }
    return [];
  }

  private async getCrawlerTargetById(id: string): Promise<CrawlTarget> {
    const targets = await this.getCrawlerTargets();
    const target = targets.find((item) => item.id === id);
    if (!target) throw new Error('Crawler target not found.');
    return target;
  }

  private async getKeywordRules(): Promise<KeywordRule[]> {
    const setting = await this.settingRepository.findOne({
      where: { key: 'keyword_rules' },
    });
    const value = setting?.value;
    if (Array.isArray(value)) return value as KeywordRule[];
    if (
      value &&
      typeof value === 'object' &&
      Array.isArray((value as { rules?: unknown[] }).rules)
    ) {
      return (value as { rules: KeywordRule[] }).rules;
    }
    return [];
  }

  /** Nội dung crawl không đáng tin: escape HTML, chỉ đưa link http(s) vào tin nhắn. */
  static buildTelegramMessage(event: Event): string {
    const formattedDate = event.eventDate
      ? new Date(event.eventDate).toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Asia/Ho_Chi_Minh',
        })
      : '';
    const safeUrl = /^https?:\/\//i.test(event.url || '') ? event.url : '';

    const lines = [
      '<b>🔔 SỰ KIỆN ĐỐI THỦ MỚI</b>',
      `<b>Thương hiệu:</b> ${escapeHtml(event.sourceName)}`,
      `<b>Tiêu đề:</b> ${escapeHtml(event.title)}`,
      `<b>Loại sự kiện:</b> ${escapeHtml(event.type)}`,
      formattedDate ? `<b>Thời gian:</b> ${formattedDate}` : '',
      safeUrl ? `<b>Chi tiết:</b> ${escapeHtml(safeUrl)}` : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private async notifyTelegram(
    event: Event,
  ): Promise<'sent' | 'failed' | 'skipped'> {
    const msg = CrawlerService.buildTelegramMessage(event);
    try {
      const image =
        event.image && /^https?:\/\//i.test(event.image) ? event.image : null;
      let response: TelegramResponse = image
        ? await this.telegramService.sendPhoto(image, msg)
        : await this.telegramService.sendMessage(msg);
      if (response?.skipped) return 'skipped';
      if (!response?.ok && image) {
        // Ảnh hỏng hoặc hết hạn: gửi lại dạng chữ để không mất thông báo.
        this.logger.warn(
          `Telegram sendPhoto lỗi cho event ${event.id}: ${response?.description ?? 'unknown'}; gửi dạng chữ.`,
        );
        response = await this.telegramService.sendMessage(msg);
      }
      if (response?.ok) return 'sent';
      this.logger.warn(
        `Telegram gửi lỗi cho event ${event.id}: ${response?.description ?? 'unknown'}`,
      );
      return 'failed';
    } catch (err) {
      this.logger.warn(
        `Telegram gửi lỗi cho event ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'failed';
    }
  }
}

type TelegramResponse =
  { ok?: boolean; skipped?: boolean; description?: string } | null | undefined;

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
