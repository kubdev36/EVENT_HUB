import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import {
  ApiSourceConfig,
  CrawlTarget,
  ParsedCrawlItem,
} from '../crawler.types.js';
import { CrawlerHttpClient, CrawlFetchError } from './crawler-http.client.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';

@Injectable()
export class GenericApiEngine {
  private readonly logger = new Logger(GenericApiEngine.name);

  constructor(private readonly httpClient: CrawlerHttpClient) {}

  /** Nguồn có phần lấy qua API (cấu hình `api` hoặc AJAX) hay không. */
  appliesTo(target: CrawlTarget): boolean {
    return (
      target.api?.type === 'sforum-graphql' || Boolean(target.ajaxEndpoint)
    );
  }

  async fetchApiItems(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];

    // 1. API GraphQL kiểu Sforum, cấu hình trong nguồn
    if (target.api?.type === 'sforum-graphql') {
      items.push(...(await this.fetchSforumGraphQL(target, target.api)));
    }

    // 2. Custom AJAX endpoint configured in Target
    if (target.ajaxEndpoint) {
      for (const baseUrl of target.targetUrls || []) {
        items.push(...(await this.fetchConfiguredAjaxPages(target, baseUrl)));
      }
    }

    return items;
  }

  private async fetchSforumGraphQL(
    target: CrawlTarget,
    api: ApiSourceConfig,
  ): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];
    const SFORUM_GQL = api.endpoint;
    if (!/^https:\/\//i.test(SFORUM_GQL)) {
      throw new CrawlFetchError(
        'failed',
        SFORUM_GQL,
        'API endpoint phải là https',
      );
    }
    // categoryIds được chèn vào câu query nên chỉ nhận số nguyên dương.
    const categoryIds = (api.categoryIds || []).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (categoryIds.length === 0) {
      throw new CrawlFetchError(
        'failed',
        SFORUM_GQL,
        'Thiếu categoryIds hợp lệ',
      );
    }
    const maxPages = Math.min(Math.max(api.maxPages ?? 3, 1), 10);
    const gqlHeaders: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      origin: new URL(api.articleBaseUrl).origin,
      referer: api.referer || api.articleBaseUrl,
    };

    for (const catId of categoryIds) {
      for (let page = 1; page <= maxPages; page++) {
        try {
          const gqlQuery = `
            query Posts {
              posts(
                filter: { include: {categories: [${catId}]} }
                paginator: {size: 20, page: ${page}}
                sort: [{ field: "published_at", direction: "desc" }]
              ) {
                posts {
                  id title slug thumbnail short_description published_at
                }
                meta { total_items total_pages current_page page_size }
              }
            }
          `;

          this.httpClient.countRequest();
          const gqlResp = await fetch(SFORUM_GQL, {
            method: 'POST',
            headers: gqlHeaders,
            body: JSON.stringify({ query: gqlQuery, variables: {} }),
            signal: AbortSignal.timeout(15000),
          });

          if (!gqlResp.ok) {
            const reason = `HTTP ${gqlResp.status}`;
            const kind =
              gqlResp.status === 403 || gqlResp.status === 429
                ? 'blocked'
                : 'failed';
            // Trang đầu lỗi thì cả nguồn coi là lỗi; trang sau lỗi thì giữ phần đã lấy.
            if (page === 1) throw new CrawlFetchError(kind, SFORUM_GQL, reason);
            this.logger.warn(
              `Sforum category ${catId} page ${page}: ${reason}, dừng phân trang.`,
            );
            break;
          }
          const gqlJson = await gqlResp.json();
          const posts = gqlJson?.data?.posts?.posts;
          const meta = gqlJson?.data?.posts?.meta;
          if (!posts || posts.length === 0) break;

          items.push(
            ...GenericApiEngine.mapSforumPosts(
              posts,
              target,
              api.articleBaseUrl,
            ),
          );

          if (meta && meta.current_page >= meta.total_pages) break;
          await new Promise((r) => setTimeout(r, 400));
        } catch (err) {
          if (err instanceof CrawlFetchError) throw err;
          const reason = err instanceof Error ? err.message : String(err);
          if (page === 1)
            throw new CrawlFetchError('failed', SFORUM_GQL, reason);
          this.logger.warn(
            `Sforum category ${catId} page ${page}: ${reason}, dừng phân trang.`,
          );
          break;
        }
      }
    }

    return items;
  }

  /** Chuyển post Sforum thành item; giờ đăng định dạng theo Asia/Ho_Chi_Minh, không theo giờ server. */
  static mapSforumPosts(
    posts: Array<{
      id?: unknown;
      title?: string;
      slug?: string;
      thumbnail?: string;
      short_description?: string;
      published_at?: string;
    }>,
    target: CrawlTarget,
    articleBaseUrl: string,
  ): ParsedCrawlItem[] {
    const items: ParsedCrawlItem[] = [];
    const base = articleBaseUrl.endsWith('/')
      ? articleBaseUrl
      : `${articleBaseUrl}/`;
    for (const post of posts) {
      if (!post.slug || !/^[a-z0-9-]+$/i.test(post.slug)) continue;
      const articleUrl = `${base}${post.slug}`;
      const title = NoiseFilterHelper.cleanTitle(post.title || '');
      if (!title || NoiseFilterHelper.isNoiseTitle(title)) continue;

      const published = post.published_at
        ? DateExtractorHelper.parsePublishedDate(post.published_at)
        : null;
      items.push({
        title,
        url: articleUrl,
        image: post.thumbnail || null,
        description: NoiseFilterHelper.cleanDescription(post.short_description),
        eventDate: published?.date ?? null,
        eventTime: published?.time ?? null,
        rawData: {
          sourceUrl: target.targetUrls?.[0] || base,
          sforumId: post.id,
        },
      });
    }
    return items;
  }

  private async fetchConfiguredAjaxPages(
    target: CrawlTarget,
    baseUrl: string,
  ): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];
    let slug = '';
    try {
      const pathname = new URL(baseUrl).pathname.replace(/\/$/, '');
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length > 0) slug = parts[parts.length - 1];
    } catch {
      // baseUrl không parse được: payload dùng slug rỗng.
      slug = '';
    }

    let payload = (target.ajaxPayload || 'page={page}').replace(
      '{slug}',
      encodeURIComponent(slug),
    );
    if (payload.includes('ID=') && /^\d+$/.test(slug)) {
      payload = payload.replace(/ID=\d+/, `ID=${slug}`);
    }
    if (payload.includes('Size=10')) {
      payload = payload.replace('Size=10', 'Size=20');
    }

    const totalPages = 5;
    for (let page = 1; page <= totalPages; page++) {
      const body = payload.replace('{page}', page.toString());
      const response = await this.httpClient.postAjax(
        target.ajaxEndpoint!,
        body,
        baseUrl,
      );
      if (!response && page === 1) {
        throw new CrawlFetchError(
          'failed',
          target.ajaxEndpoint!,
          'AJAX không trả dữ liệu ở trang đầu',
        );
      }
      if (!response || response.length < 100) break;

      const $ = cheerio.load(response);
      $('article, li[data-id], .vts_post, .post, .item').each((_, el) => {
        const art = $(el);
        const titleAttr = art.find('a[title]').first().attr('title');
        const titleText = art
          .find('h2, h3, .title, .vts_title, a')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .trim();
        const title = NoiseFilterHelper.cleanTitle(titleAttr || titleText);
        const link = art.find('a[href]').first().attr('href');

        if (!title || !link || NoiseFilterHelper.isNoiseTitle(title)) return;

        const dateText = art
          .find('time, .date, .time, .vts_date, span[class*="date"]')
          .first()
          .text()
          .trim();
        const img =
          art.find('img').first().attr('src') ||
          art.find('img').first().attr('data-src') ||
          null;
        const resolvedUrl = UrlNormalizerHelper.resolveUrl(baseUrl, link);
        const parsedDate = DateExtractorHelper.parsePublishedDate(dateText);

        items.push({
          title,
          url: resolvedUrl,
          image:
            img && !NoiseFilterHelper.isNoiseImage(img)
              ? UrlNormalizerHelper.resolveUrl(baseUrl, img)
              : null,
          description: null,
          eventDate: parsedDate?.date || null,
          eventTime: parsedDate?.time || null,
          rawData: { sourceUrl: baseUrl, kind: 'ajax' },
        });
      });

      await new Promise((r) => setTimeout(r, 400));
    }

    return items;
  }
}
