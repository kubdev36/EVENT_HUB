import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import {
  CrawlTarget,
  ParsedCrawlItem,
  SitemapConfig,
} from '../crawler.types.js';
import { CrawlerHttpClient } from '../engine/crawler-http.client.js';
import {
  GenericSitemapEngine,
  SitemapEntry,
} from '../engine/generic-sitemap.engine.js';
import { ArticleDetailHelper } from '../helpers/article-detail.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import {
  PendingSeen,
  SitemapSeenService,
} from '../persistence/sitemap-seen.service.js';

/** Số trang mới mở chi tiết mặc định mỗi lần, cho mỗi sitemap. */
export const DEFAULT_MAX_NEW_PER_RUN = 10;
const MAX_NEW_PER_RUN_LIMIT = 50;

export type DiscoveryResult = {
  items: ParsedCrawlItem[];
  /** Link cần ghi là đã thấy sau khi lưu sự kiện thành công. */
  pendingSeen: PendingSeen | null;
  /** true: lần chạy đầu, chỉ ghi link có sẵn, không tạo sự kiện. */
  baseline: boolean;
};

/**
 * Phát hiện trang mới từ sitemap: so với link đã thấy, mở trang mới để lấy tiêu đề, ảnh,
 * ngày đăng (chỉ từ dữ liệu có cấu trúc của trang). Không dùng lastmod hay ngày crawl làm ngày đăng.
 */
@Injectable()
export class SitemapDiscoveryService {
  private readonly logger = new Logger(SitemapDiscoveryService.name);

  constructor(
    private readonly engine: GenericSitemapEngine,
    private readonly seen: SitemapSeenService,
    private readonly httpClient: CrawlerHttpClient,
  ) {}

  async discover(
    target: CrawlTarget,
    config: SitemapConfig,
  ): Promise<DiscoveryResult> {
    const entries = await this.engine.fetchEntries(config);

    // Lần đầu: ghi lại mọi link hiện có để trang cũ không bị báo là mới.
    if (!(await this.seen.hasBaseline(target.id, config.url))) {
      await this.seen.markSeen({
        sourceId: target.id,
        sitemapUrl: config.url,
        entries,
      });
      this.logger.log(
        `Sitemap ${config.url} (${target.id}): lần đầu, ghi ${entries.length} link, không tạo sự kiện`,
      );
      return { items: [], pendingSeen: null, baseline: true };
    }

    const seenUrls = await this.seen.loadSeenUrls(target.id);
    const fresh = SitemapDiscoveryService.dedupe(
      entries.filter((e) => !seenUrls.has(e.url)),
    );
    const limit = Math.min(
      Math.max(config.maxNewPerRun ?? DEFAULT_MAX_NEW_PER_RUN, 1),
      MAX_NEW_PER_RUN_LIMIT,
    );
    // Phần vượt giới hạn để lần sau (chưa ghi là đã thấy).
    const batch = fresh.slice(0, limit);

    const items: ParsedCrawlItem[] = [];
    const processed: SitemapEntry[] = [];
    for (const entry of batch) {
      const page = await this.httpClient.fetchPage(entry.url);
      if (page.kind !== 'ok') {
        // Chưa ghi là đã thấy: lần sau thử lại.
        this.logger.warn(
          `Không mở được trang mới ${entry.url} từ sitemap: ${page.reason}`,
        );
        continue;
      }
      processed.push(entry);
      const item = SitemapDiscoveryService.toItem(
        page.html,
        page.url,
        entry,
        config,
      );
      if (item) items.push(item);
    }

    return {
      items,
      pendingSeen: processed.length
        ? { sourceId: target.id, sitemapUrl: config.url, entries: processed }
        : null,
      baseline: false,
    };
  }

  /** Tạo item từ trang chi tiết. Không có tiêu đề thì bỏ (vẫn ghi là đã thấy). */
  static toItem(
    html: string,
    pageUrl: string,
    entry: SitemapEntry,
    config: SitemapConfig,
  ): ParsedCrawlItem | null {
    const detail = ArticleDetailHelper.parse(html, pageUrl);
    const title =
      detail.title ||
      NoiseFilterHelper.cleanTitle(cheerio.load(html)('title').first().text());
    if (!title) return null;
    return {
      title,
      url: entry.url,
      image: detail.image,
      description: null,
      // Chỉ ngày đăng từ dữ liệu có cấu trúc; không có thì để trống (dateUnknown).
      eventDate: detail.published?.date ?? null,
      eventTime: detail.published?.time ?? null,
      detailFetched: true,
      rawData: {
        kind: 'sitemap-page',
        sitemapUrl: config.url,
        lastmod: entry.lastmod ? entry.lastmod.toISOString() : null,
      },
    };
  }

  private static dedupe(entries: SitemapEntry[]): SitemapEntry[] {
    const seen = new Set<string>();
    return entries.filter((e) =>
      seen.has(e.url) ? false : (seen.add(e.url), true),
    );
  }
}
