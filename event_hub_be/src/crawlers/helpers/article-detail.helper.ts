import * as cheerio from 'cheerio';
import { DateExtractorHelper, ParsedDate } from './date-extractor.helper.js';
import { NoiseFilterHelper } from './noise-filter.helper.js';
import { UrlNormalizerHelper } from './url-normalizer.helper.js';

export type ArticleDetail = {
  published: ParsedDate | null;
  image: string | null;
  title: string | null;
};

const ARTICLE_TYPES = ['NewsArticle', 'Article', 'BlogPosting', 'Report'];

/**
 * Đọc ngày đăng, ảnh, tiêu đề từ trang chi tiết bài viết.
 * Ưu tiên JSON-LD (datePublished), sau đó meta article:published_time / itemprop.
 */
export class ArticleDetailHelper {
  static parse(html: string, pageUrl: string): ArticleDetail {
    const $ = cheerio.load(html);
    const ld = this.findArticleJsonLd($);

    const dateText =
      (typeof ld?.datePublished === 'string' ? ld.datePublished : null) ||
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[itemprop="datePublished"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      null;

    const ldImage = this.firstString(ld?.image);
    const rawImage =
      $('meta[property="og:image"]').attr('content') || ldImage || null;
    const image =
      rawImage && !NoiseFilterHelper.isNoiseImage(rawImage)
        ? UrlNormalizerHelper.resolveUrl(pageUrl, rawImage)
        : null;

    const rawTitle =
      (typeof ld?.headline === 'string' ? ld.headline : null) ||
      $('meta[property="og:title"]').attr('content') ||
      null;

    return {
      published: this.parseDate(dateText),
      image: image && /^https?:\/\//i.test(image) ? image : null,
      title: rawTitle ? NoiseFilterHelper.cleanTitle(rawTitle) : null,
    };
  }

  /** Nửa đêm giờ Việt Nam (vd. "...T00:00:00+07:00", "...T17:00:00+00:00") là ngày không có giờ thật. */
  private static parseDate(text: string | null): ParsedDate | null {
    if (!text) return null;
    return DateExtractorHelper.withoutMidnightTime(
      DateExtractorHelper.parsePublishedDate(text),
    );
  }

  private static findArticleJsonLd(
    $: cheerio.CheerioAPI,
  ): Record<string, unknown> | null {
    const candidates: Record<string, unknown>[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        candidates.push(...this.flatten(JSON.parse($(el).text())));
      } catch {
        // JSON-LD hỏng trên trang: bỏ khối này, thử khối khác hoặc meta tag.
        return;
      }
    });
    const isArticle = (o: Record<string, unknown>) => {
      const t = o['@type'];
      return (Array.isArray(t) ? t : [t]).some((x) =>
        ARTICLE_TYPES.includes(String(x)),
      );
    };
    return (
      candidates.find((o) => isArticle(o) && o.datePublished) ||
      candidates.find((o) => o.datePublished) ||
      null
    );
  }

  private static flatten(node: unknown): Record<string, unknown>[] {
    if (Array.isArray(node)) return node.flatMap((n) => this.flatten(n));
    if (!node || typeof node !== 'object') return [];
    const obj = node as Record<string, unknown>;
    return [obj, ...(obj['@graph'] ? this.flatten(obj['@graph']) : [])];
  }

  private static firstString(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return this.firstString(value[0]);
    if (value && typeof value === 'object' && 'url' in value) {
      return this.firstString((value as { url: unknown }).url);
    }
    return null;
  }
}
