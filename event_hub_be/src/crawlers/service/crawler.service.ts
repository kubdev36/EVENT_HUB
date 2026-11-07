import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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

/** Event có ngày đăng trước mốc này bị bỏ qua (dữ liệu cũ). */
const MIN_EVENT_DATE = new Date('2025-01-01T00:00:00+07:00');

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  /** Nghỉ giữa các URL của cùng một nguồn. */
  urlDelayMs = 500;
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
  ) {}

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

  async crawlAllTargets() {
    const targets = (await this.getCrawlerTargets()).filter(
      (target) => target.enabled !== false,
    );
    const results = [];
    for (const target of targets) {
      const res = await this.crawlTargetSafely(target);
      results.push(res);
      // Gentle delay between targets (2-3s) to prevent IP rate-limiting & WAF flags
      await new Promise((resolve) =>
        setTimeout(resolve, 2000 + Math.random() * 1000),
      );
    }
    await this.notifyAfterCrawl();
    return results;
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

  async crawlTarget(target: CrawlTarget) {
    const startedMs = Date.now();
    const requestsBefore = this.httpClient.requestCount;
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
      const rules = await this.getKeywordRules();
      const seen = new Set<string>();
      let newItemsCount = 0;
      const detail = {
        enabled: Boolean(target.extract?.fetchDetail),
        remaining: Math.min(
          Math.max(target.extract?.maxDetailPerRun ?? 10, 0),
          50,
        ),
        delayMs: Math.max(target.extract?.detailDelayMs ?? 2000, 0),
      };

      // Filter and deduplicate within current run
      const validItems: ParsedCrawlItem[] = [];
      const exclude = CrawlerService.buildExcludePattern(target);
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
        validItems.push(item);
      }

      // Bước 1: phân loại và tìm event đã có cho từng bài.
      const prepared: Array<{
        item: ParsedCrawlItem;
        type: string;
        contentHash: string;
        externalId: string | null;
        existing: Event | null;
      }> = [];
      for (const item of validItems) {
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
        const existing = await this.eventRepository.findOne({
          where: [
            ...(externalId ? [{ sourceId: target.id, externalId }] : []),
            { sourceId: target.id, url: item.url },
            { sourceId: target.id, contentHash },
          ],
        });
        prepared.push({ item, type, contentHash, externalId, existing });
      }

      // Bước 2 (crawl hai bước): tải trang chi tiết để lấy ngày cho bài chưa có ngày,
      // ưu tiên bài mới trước, sau đó mới đến bài cũ chưa rõ ngày; có giới hạn mỗi lần.
      if (detail.enabled) {
        const needDetail = prepared
          .filter(
            (p) =>
              // Chỉ tin ngày do engine lấy từ dữ liệu có cấu trúc; ngày đoán từ tiêu đề không tính.
              !p.item.eventDate &&
              (!p.existing ||
                p.existing.dateUnknown ||
                // Ngày cũ nằm ở tương lai là ngày sai (vd. hạn khuyến mãi), cần lấy lại.
                (p.existing.eventDate !== null &&
                  new Date(p.existing.eventDate).getTime() >
                    Date.now() + 86_400_000)),
          )
          .sort(
            (a, b) => Number(Boolean(a.existing)) - Number(Boolean(b.existing)),
          )
          .slice(0, detail.remaining);
        for (const p of needDetail) {
          await this.enrichFromDetail(p.item, detail.delayMs);
        }
      }

      // Bước 3: ghi DB.
      for (const {
        item,
        type,
        contentHash,
        externalId,
        existing,
      } of prepared) {
        const dateInfo = DateExtractorHelper.parseItemEventDate(item);

        if (existing) {
          existing.lastSeenAt = new Date();
          existing.title = item.title;
          existing.description = item.description ?? existing.description;
          if (item.image && !NoiseFilterHelper.isNoiseImage(item.image)) {
            existing.image = item.image;
          }
          // Only update eventDate if we found an explicit real date from this item
          if (
            dateInfo.isExplicit &&
            dateInfo.date &&
            !isNaN(dateInfo.date.getTime())
          ) {
            existing.eventDate = dateInfo.date;
            existing.eventTime = dateInfo.time || existing.eventTime;
            existing.dateUnknown = false;
          }
          if (externalId && !existing.externalId)
            existing.externalId = externalId;
          existing.type = type;
          await this.eventRepository.save(existing);
          continue;
        }

        // Không tìm được ngày đăng thì để trống và đánh dấu dateUnknown, không dùng ngày crawl.
        const eventDate =
          dateInfo.date && !isNaN(dateInfo.date.getTime())
            ? dateInfo.date
            : null;
        if (eventDate && eventDate < MIN_EVENT_DATE) continue;

        const newEvent = this.eventRepository.create({
          sourceId: target.id,
          sourceName: target.name,
          origin: 'crawler',
          sourceUrl: (item.rawData?.sourceUrl as string) || item.url,
          title: item.title,
          description: item.description ?? null,
          image:
            item.image && !NoiseFilterHelper.isNoiseImage(item.image)
              ? item.image
              : null,
          url: item.url,
          eventDate,
          eventTime: eventDate ? dateInfo.time : null,
          dateUnknown: !eventDate,
          externalId,
          type,
          rawData: item.rawData ?? null,
          contentHash,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          notifiedAt: null,
        });

        await this.eventRepository.save(newEvent);
        newItemsCount += 1;
      }

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
      this.finishRun(run, startedMs, requestsBefore);
      await this.crawlerRunRepository.save(run);

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
      this.finishRun(run, startedMs, requestsBefore);
      await this.crawlerRunRepository.save(run);
      throw error;
    }
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
  ) {
    run.finishedAt = new Date();
    run.durationMs = Date.now() - startedMs;
    run.requestCount = this.httpClient.requestCount - requestsBefore;
    // Log JSON một dòng để đo baseline (thời gian, số request, số item theo nguồn).
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

    // 2. Các URL đã cấu hình
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
      if (this.urlDelayMs > 0)
        await new Promise((r) => setTimeout(r, this.urlDelayMs));
    }

    return { items: allItems, errors, attempts };
  }

  /**
   * Tải trang chi tiết để lấy ngày đăng và ảnh. Lỗi chỉ ghi log: bài vẫn được lưu
   * với dateUnknown và sẽ thử lại ở lần cào sau.
   */
  private async enrichFromDetail(
    item: ParsedCrawlItem,
    delayMs: number,
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
    if (!detail.published) return false;
    item.eventDate = detail.published.date;
    item.eventTime = detail.published.time;
    return true;
  }

  private async crawlTargetSafely(target: CrawlTarget) {
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
