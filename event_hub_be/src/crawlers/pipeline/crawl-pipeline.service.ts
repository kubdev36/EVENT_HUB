import { Injectable, Logger } from '@nestjs/common';
import { ClassifierService } from '../../classifier/classifier.service.js';
import { CrawlTarget, KeywordRule, ParsedCrawlItem } from '../crawler.types.js';
import { CrawlerRunStatus } from '../entity/crawler-run.entity.js';
import {
  CrawlerHttpClient,
  CrawlFetchError,
} from '../engine/crawler-http.client.js';
import { GenericApiEngine } from '../engine/generic-api.engine.js';
import { GenericHtmlEngine } from '../engine/generic-html.engine.js';
import { GenericMetaAdsEngine } from '../engine/generic-meta-ads.engine.js';
import { GenericRssEngine } from '../engine/generic-rss.engine.js';
import { ArticleDetailHelper } from '../helpers/article-detail.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';
import type {
  ExistingIndex,
  PreparedItem,
} from '../persistence/event-upsert.service.js';
import type { PendingSeen } from '../persistence/sitemap-seen.service.js';
import { SitemapDiscoveryService } from './sitemap-discovery.service.js';

/** Số trang chi tiết mặc định mỗi lần cào một nguồn. */
const DEFAULT_DETAIL_BUDGET = 10;

export type FetchOutcome = {
  items: ParsedCrawlItem[];
  errors: CrawlFetchError[];
  attempts: number;
  /** Link sitemap cần ghi là đã thấy, sau khi lưu sự kiện thành công. */
  pendingSeen: PendingSeen[];
};

/** Loại engine cho một URL nguồn. */
export type UrlEngineKind = 'meta-ads' | 'rss' | 'html';

/**
 * Xử lý dữ liệu của một nguồn: tải (chọn engine), lọc, phân loại và ghép với event có sẵn,
 * lấy trang chi tiết khi cần. Không ghi DB.
 */
@Injectable()
export class CrawlPipeline {
  private readonly logger = new Logger(CrawlPipeline.name);

  constructor(
    private readonly classifierService: ClassifierService,
    private readonly rssEngine: GenericRssEngine,
    private readonly apiEngine: GenericApiEngine,
    private readonly htmlEngine: GenericHtmlEngine,
    private readonly metaAdsEngine: GenericMetaAdsEngine,
    private readonly httpClient: CrawlerHttpClient,
    private readonly sitemapDiscovery: SitemapDiscoveryService,
  ) {}

  /** Chọn engine theo dạng URL (giữ nguyên quy tắc cũ). */
  static engineForUrl(url: string): UrlEngineKind {
    if (url.includes('facebook.com') || url.includes('ads/library'))
      return 'meta-ads';
    if (
      url.includes('.rss') ||
      url.includes('.xml') ||
      url.includes('/feed') ||
      url.includes('format=Atom') ||
      url.includes('format=Mrss')
    )
      return 'rss';
    return 'html';
  }

  /** Tải mọi phần của nguồn (API, từng URL). Phần lỗi được ghi lại, không bị bỏ qua im lặng. */
  async fetch(target: CrawlTarget): Promise<FetchOutcome> {
    const items: ParsedCrawlItem[] = [];
    const errors: CrawlFetchError[] = [];
    const pendingSeen: PendingSeen[] = [];
    let attempts = 0;

    const attempt = async (
      label: string,
      fn: () => Promise<ParsedCrawlItem[]>,
    ) => {
      attempts += 1;
      try {
        items.push(...(await fn()));
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
    for (const raw of target.targetUrls || []) {
      const url = raw.trim();
      if (!url) continue;
      const kind = CrawlPipeline.engineForUrl(url);
      await attempt(url, () => {
        if (kind === 'meta-ads') return this.metaAdsEngine.fetchActiveAds(url);
        if (kind === 'rss') return this.rssEngine.fetchRssOrSitemap(url);
        return this.htmlEngine.fetchHtmlItems(url, target.extract);
      });
    }

    // 3. Sitemap: chỉ trang mới xuất hiện so với các lần trước
    for (const sitemap of target.sitemaps || []) {
      await attempt(`sitemap:${sitemap.url}`, async () => {
        const result = await this.sitemapDiscovery.discover(target, sitemap);
        if (result.pendingSeen) pendingSeen.push(result.pendingSeen);
        return result.items;
      });
    }

    return { items, errors, attempts, pendingSeen };
  }

  /** Bỏ bài trùng URL trong lần cào, tiêu đề nhiễu và tiêu đề khớp bộ lọc của nguồn. */
  filter(target: CrawlTarget, rawItems: ParsedCrawlItem[]): ParsedCrawlItem[] {
    const seen = new Set<string>();
    const exclude = CrawlPipeline.buildExcludePattern(target);
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

  /** Phân loại và ghép với event có sẵn (theo externalId, URL, rồi hash). Bài không phân loại được bị bỏ. */
  prepare(
    target: CrawlTarget,
    items: ParsedCrawlItem[],
    rules: KeywordRule[],
    existing: ExistingIndex,
  ): PreparedItem[] {
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
      const match =
        (externalId ? existing.byExternalId.get(externalId) : undefined) ??
        existing.byUrl.get(item.url) ??
        existing.byHash.get(contentHash) ??
        null;
      prepared.push({ item, type, contentHash, externalId, existing: match });
    }
    return prepared;
  }

  /**
   * Crawl hai bước, chỉ cho bài cần: bài mới thiếu ảnh, hoặc (khi nguồn bật fetchDetail)
   * bài chưa có ngày từ dữ liệu có cấu trúc. Ưu tiên bài mới; có giới hạn mỗi lần.
   */
  async enrichFromDetails(
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
        // Engine đã mở trang chi tiết (vd. trang mới từ sitemap): không tải lại.
        if (p.item.detailFetched) return false;
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
      new Logger(CrawlPipeline.name).warn(
        `excludeTitlePattern của ${target.id} không hợp lệ: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
