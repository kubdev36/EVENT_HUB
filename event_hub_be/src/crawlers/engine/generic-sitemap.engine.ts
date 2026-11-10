import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { SitemapConfig } from '../crawler.types.js';
import { CrawlerHttpClient, CrawlFetchError } from './crawler-http.client.js';

/** Giới hạn dung lượng một file sitemap (đề xuất; chuẩn sitemap cho tối đa 50 MB). */
export const MAX_SITEMAP_BYTES = 15 * 1024 * 1024;
/** Số file con tối đa mở từ một sitemap index mỗi lần. */
export const MAX_CHILD_SITEMAPS = 3;
/** Số link tối đa đọc từ một file (chuẩn sitemap: 50.000). */
const MAX_ENTRIES = 50_000;

export type SitemapEntry = {
  url: string;
  /** Ngày sửa trang theo sitemap; chỉ để tham khảo, không phải ngày đăng. */
  lastmod: Date | null;
};

export type ParsedSitemap =
  | { kind: 'urlset'; entries: SitemapEntry[] }
  | { kind: 'index'; children: string[] };

/**
 * Đọc sitemap của nguồn: urlset hoặc sitemap index (chỉ mở file con khớp childPattern).
 * Chỉ trả link http(s) cùng domain với sitemap, khớp includePattern và không khớp excludePattern.
 */
@Injectable()
export class GenericSitemapEngine {
  constructor(private readonly httpClient: CrawlerHttpClient) {}

  async fetchEntries(config: SitemapConfig): Promise<SitemapEntry[]> {
    const include = GenericSitemapEngine.compile(
      config.includePattern,
      config.url,
      'includePattern',
    );
    const exclude = config.excludePattern
      ? GenericSitemapEngine.compile(
          config.excludePattern,
          config.url,
          'excludePattern',
        )
      : null;

    const root = await this.load(config.url);
    let entries: SitemapEntry[];
    if (root.kind === 'urlset') {
      entries = root.entries;
    } else {
      const childRe = config.childPattern
        ? GenericSitemapEngine.compile(
            config.childPattern,
            config.url,
            'childPattern',
          )
        : null;
      const children = root.children
        .filter((c) => !childRe || childRe.test(c))
        .slice(0, MAX_CHILD_SITEMAPS);
      if (children.length === 0)
        throw new CrawlFetchError(
          'failed',
          config.url,
          'Sitemap index không có file con khớp childPattern',
        );
      entries = [];
      for (const child of children) {
        const sub = await this.load(child);
        if (sub.kind !== 'urlset')
          throw new CrawlFetchError(
            'failed',
            child,
            'File con lại là sitemap index (không hỗ trợ lồng nhiều cấp)',
          );
        entries.push(...sub.entries);
      }
    }

    const host = GenericSitemapEngine.baseHost(config.url);
    return entries.filter((e) => {
      let parsed: URL;
      try {
        parsed = new URL(e.url);
      } catch {
        return false; // link hỏng trong sitemap: bỏ qua link đó
      }
      if (!/^https?:$/.test(parsed.protocol)) return false;
      if (GenericSitemapEngine.baseHost(parsed.href) !== host) return false;
      return include.test(parsed.pathname) && !exclude?.test(parsed.pathname);
    });
  }

  private async load(url: string): Promise<ParsedSitemap> {
    const res = await this.httpClient.fetchBinary(
      url,
      MAX_SITEMAP_BYTES,
      'application/xml,text/xml;q=0.9,*/*;q=0.5',
    );
    if (res.kind !== 'ok') throw new CrawlFetchError(res.kind, url, res.reason);
    return GenericSitemapEngine.parse(res.body.toString('utf8'), url);
  }

  /** Phân tích nội dung sitemap. Ném CrawlFetchError nếu không phải sitemap. */
  static parse(xml: string, url: string): ParsedSitemap {
    const $ = cheerio.load(xml, { xmlMode: true });
    if ($('sitemapindex').length > 0) {
      const children = $('sitemapindex > sitemap > loc')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((u) => /^https?:\/\//i.test(u));
      return { kind: 'index', children };
    }
    if ($('urlset').length === 0)
      throw new CrawlFetchError(
        'failed',
        url,
        'Nội dung trả về không phải sitemap (thiếu <urlset> hoặc <sitemapindex>)',
      );
    const entries: SitemapEntry[] = [];
    $('urlset > url').each((_, el) => {
      if (entries.length >= MAX_ENTRIES) return false;
      const loc = $(el).children('loc').text().trim();
      if (!loc) return;
      const raw = $(el).children('lastmod').text().trim();
      const d = raw ? new Date(raw) : null;
      entries.push({
        url: loc,
        lastmod: d && !Number.isNaN(d.getTime()) ? d : null,
      });
    });
    return { kind: 'urlset', entries };
  }

  /** Host bỏ "www." để so cùng domain. */
  static baseHost(url: string): string {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  }

  private static compile(pattern: string, url: string, field: string): RegExp {
    try {
      return new RegExp(pattern, 'i');
    } catch (err) {
      throw new CrawlFetchError(
        'failed',
        url,
        `${field} không phải regex hợp lệ: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
