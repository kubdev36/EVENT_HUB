import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { ExtractConfig, ParsedCrawlItem } from '../crawler.types.js';
import { CrawlerHttpClient, CrawlFetchError } from './crawler-http.client.js';

const DEFAULT_IMAGE_ATTRS = [
  'data-original',
  'data-src',
  'data-lazy-src',
  'src',
];
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';

@Injectable()
export class GenericHtmlEngine {
  constructor(private readonly httpClient: CrawlerHttpClient) {}

  async fetchHtmlItems(
    url: string,
    extract?: ExtractConfig,
  ): Promise<ParsedCrawlItem[]> {
    const resp = await this.httpClient.requirePage(url);

    if (extract) {
      const configured = GenericHtmlEngine.extractConfigured(
        resp.html,
        resp.url,
        extract,
      );
      // Selector không khớp bài nào: thường do web đổi giao diện, báo lỗi để cảnh báo.
      if (configured.length === 0) {
        throw new CrawlFetchError(
          'failed',
          url,
          'Cấu hình trích xuất không khớp bài nào (web có thể đã đổi giao diện)',
        );
      }
      return configured;
    }

    const $ = cheerio.load(resp.html);
    const items: ParsedCrawlItem[] = [];

    // 1. Extract from Next.js Hydration payload
    items.push(...this.extractNextJsPayload(resp.html, resp.url));

    // 2. Extract from semantic HTML blocks
    items.push(...this.extractFromEventBlocks($, resp.url));

    // 3. Extract from OpenGraph Metadata if page is a single article
    if (items.length === 0) {
      items.push(...this.extractFromMetadata($, resp.url));
    }

    return items;
  }

  /**
   * Trích xuất theo cấu hình của nguồn. Chỉ nhận link cùng domain với trang nguồn
   * và khớp articleUrlPattern (nếu có). Nhiều link cùng URL được gộp thành một bài.
   */
  static extractConfigured(
    html: string,
    sourceUrl: string,
    cfg: ExtractConfig,
    referenceDate: Date = new Date(),
  ): ParsedCrawlItem[] {
    const $ = cheerio.load(html);
    let pattern: RegExp | null = null;
    if (cfg.articleUrlPattern) {
      try {
        pattern = new RegExp(cfg.articleUrlPattern);
      } catch (err) {
        throw new CrawlFetchError(
          'failed',
          sourceUrl,
          `articleUrlPattern không hợp lệ: ${(err as Error).message}`,
        );
      }
    }
    const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '');
    const byUrl = new Map<string, ParsedCrawlItem>();

    const blocks = cfg.itemSelector ? $(cfg.itemSelector) : $('a[href]');
    blocks.each((_, el) => {
      const block = $(el);
      const link = block.is('a[href]')
        ? block
        : block.find(cfg.linkSelector || 'a[href]').first();
      const href = link.attr('href');
      if (!href) return;

      let parsed: URL;
      try {
        parsed = new URL(href, sourceUrl);
      } catch {
        return; // href không phải URL hợp lệ: bỏ qua link này
      }
      if (!/^https?:$/.test(parsed.protocol)) return;
      const host = parsed.hostname.replace(/^www\./, '');
      if (host !== sourceHost && !host.endsWith(`.${sourceHost}`)) return;
      if (pattern && !pattern.test(parsed.pathname)) return;

      const titleNode = cfg.titleSelector
        ? block.find(cfg.titleSelector).first()
        : block.find('h1, h2, h3, h4').first();
      const rawTitle =
        (cfg.titleAttr && titleNode.attr(cfg.titleAttr)) ||
        titleNode.text() ||
        link.attr('title') ||
        block.find('img').first().attr('alt') ||
        link.text();
      const title = NoiseFilterHelper.cleanTitle(
        (rawTitle || '').replace(/\s+/g, ' ').trim(),
      );
      const image = GenericHtmlEngine.pickImage(
        block.find('img').first(),
        cfg.imageAttrs,
      );
      const url = parsed.toString();
      const published = cfg.dateSelector
        ? DateExtractorHelper.parsePublishedDate(
            block.find(cfg.dateSelector).first().text(),
            referenceDate,
          )
        : null;

      const prev = byUrl.get(url);
      if (prev) {
        // Gộp: giữ tiêu đề dài hơn, ảnh đầu tiên tìm được.
        if (title.length > prev.title.length) prev.title = title;
        if (!prev.image && image)
          prev.image = UrlNormalizerHelper.resolveUrl(sourceUrl, image);
        if (!prev.eventDate && published) {
          prev.eventDate = published.date;
          prev.eventTime = published.time;
        }
        return;
      }
      byUrl.set(url, {
        title,
        url,
        image: image ? UrlNormalizerHelper.resolveUrl(sourceUrl, image) : null,
        description: null,
        eventDate: published?.date ?? null,
        eventTime: published?.time ?? null,
        rawData: { sourceUrl, kind: 'configured-html' },
      });
    });

    return [...byUrl.values()].filter(
      (item) => item.title && !NoiseFilterHelper.isNoiseTitle(item.title),
    );
  }

  /** Lấy ảnh theo thứ tự thuộc tính; bỏ ảnh nhúng data: (thường là ảnh chờ lazy-load) và ảnh nhiễu. */
  static pickImage(
    img: ReturnType<cheerio.CheerioAPI>,
    attrs: string[] = DEFAULT_IMAGE_ATTRS,
  ): string | null {
    for (const attr of attrs) {
      const value = img.attr(attr)?.trim();
      if (!value || value.startsWith('data:')) continue;
      if (NoiseFilterHelper.isNoiseImage(value)) continue;
      return value;
    }
    return null;
  }

  private extractNextJsPayload(
    html: string,
    sourceUrl: string,
  ): ParsedCrawlItem[] {
    const items: ParsedCrawlItem[] = [];
    if (!html.includes('self.__next_f') && !html.includes('__NEXT_DATA__'))
      return items;

    // Scan for JSON post objects in Next.js payloads
    const matches = html.matchAll(
      /"title"\s*:\s*"([^"]{8,150})"[^}]*?"(slug|url)"\s*:\s*"([^"]+)"/g,
    );
    for (const match of matches) {
      const title = NoiseFilterHelper.cleanTitle(match[1]);
      const slugOrUrl = match[3];
      if (!title || !slugOrUrl || NoiseFilterHelper.isNoiseTitle(title))
        continue;

      const fullUrl = slugOrUrl.startsWith('http')
        ? slugOrUrl
        : UrlNormalizerHelper.resolveUrl(
            sourceUrl,
            slugOrUrl.startsWith('/') ? slugOrUrl : `/${slugOrUrl}`,
          );

      items.push({
        title,
        url: fullUrl,
        image: null,
        description: null,
        rawData: { sourceUrl, kind: 'nextjs-payload' },
      });
    }

    return items;
  }

  private extractFromEventBlocks(
    $: cheerio.CheerioAPI,
    sourceUrl: string,
  ): ParsedCrawlItem[] {
    const items: ParsedCrawlItem[] = [];
    const selectors = [
      'article',
      '.post',
      '.news-item',
      '.item-news',
      '.card-news',
      '.event-item',
      'li[class*="news"]',
      'div[class*="news-item"]',
      'div[class*="article"]',
    ];

    $(selectors.join(', ')).each((_, el) => {
      const block = $(el);
      const titleNode = block.find('h2, h3, h4, .title, a[title]').first();
      const titleAttr = titleNode.attr('title');
      const titleText = titleNode.text().replace(/\s+/g, ' ').trim();
      const title = NoiseFilterHelper.cleanTitle(titleAttr || titleText);

      const link =
        block.find('a[href]').first().attr('href') || block.attr('href');
      if (!title || !link || NoiseFilterHelper.isNoiseTitle(title)) return;

      const fullUrl = UrlNormalizerHelper.resolveUrl(sourceUrl, link);
      if (!UrlNormalizerHelper.isLikelyEventUrl(fullUrl)) return;

      const img = GenericHtmlEngine.pickImage(block.find('img').first());

      const dateText = block
        .find('time, .date, .time, span[class*="date"]')
        .first()
        .text()
        .trim();
      const parsedDate = DateExtractorHelper.parsePublishedDate(dateText);
      const desc = block
        .find('p, .desc, .summary, .description')
        .first()
        .text()
        .trim();

      items.push({
        title,
        url: fullUrl,
        image:
          img && !NoiseFilterHelper.isNoiseImage(img)
            ? UrlNormalizerHelper.resolveUrl(sourceUrl, img)
            : null,
        description: NoiseFilterHelper.cleanDescription(desc),
        eventDate: parsedDate?.date || null,
        eventTime: parsedDate?.time || null,
        rawData: { sourceUrl, kind: 'html-block' },
      });
    });

    return items;
  }

  private extractFromMetadata(
    $: cheerio.CheerioAPI,
    sourceUrl: string,
  ): ParsedCrawlItem[] {
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text().trim();
    const cleanTitle = NoiseFilterHelper.cleanTitle(title);
    if (!cleanTitle || NoiseFilterHelper.isNoiseTitle(cleanTitle)) return [];

    const desc =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;
    const image = $('meta[property="og:image"]').attr('content') || null;
    const pubDate =
      $('meta[property="article:published_time"]').attr('content') || null;
    const parsedDate = DateExtractorHelper.parsePublishedDate(pubDate);

    return [
      {
        title: cleanTitle,
        url: sourceUrl,
        image: image && !NoiseFilterHelper.isNoiseImage(image) ? image : null,
        description: NoiseFilterHelper.cleanDescription(desc),
        eventDate: parsedDate?.date || null,
        eventTime: parsedDate?.time || null,
        rawData: { sourceUrl, kind: 'metadata' },
      },
    ];
  }
}
