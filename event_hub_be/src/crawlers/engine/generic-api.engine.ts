import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { CrawlTarget, ParsedCrawlItem } from '../crawler.types.js';
import { CrawlerHttpClient } from './crawler-http.client.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';

@Injectable()
export class GenericApiEngine {
  constructor(private readonly httpClient: CrawlerHttpClient) {}

  async fetchApiItems(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];

    // 1. Check if Sforum GraphQL target
    const isSforum = target.targetUrls?.some((u) => u.includes('cellphones.com.vn') || u.includes('sforum.vn'));
    if (isSforum) {
      items.push(...(await this.fetchSforumGraphQL(target)));
    }

    // 2. Custom AJAX endpoint configured in Target
    if (target.ajaxEndpoint) {
      for (const baseUrl of target.targetUrls || []) {
        items.push(...(await this.fetchConfiguredAjaxPages(target, baseUrl)));
      }
    }

    return items;
  }

  private async fetchSforumGraphQL(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];
    const SFORUM_GQL = 'https://api.sforum.vn/graphql/query';
    const categoryIds = [10078, 27510]; // Khuyến mãi, Sự kiện
    const gqlHeaders = {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      origin: 'https://cellphones.com.vn',
      referer: 'https://cellphones.com.vn/sforum/khuyen-mai-soc',
    };

    for (const catId of categoryIds) {
      for (let page = 1; page <= 3; page++) {
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

          const gqlResp = await fetch(SFORUM_GQL, {
            method: 'POST',
            headers: gqlHeaders,
            body: JSON.stringify({ query: gqlQuery, variables: {} }),
            signal: AbortSignal.timeout(15000),
          });

          if (!gqlResp.ok) break;
          const gqlJson = await gqlResp.json();
          const posts = gqlJson?.data?.posts?.posts;
          const meta = gqlJson?.data?.posts?.meta;
          if (!posts || posts.length === 0) break;

          for (const post of posts) {
            const articleUrl = `https://cellphones.com.vn/sforum/${post.slug}`;
            const title = NoiseFilterHelper.cleanTitle(post.title || '');
            if (!title || NoiseFilterHelper.isNoiseTitle(title)) continue;

            items.push({
              title,
              url: articleUrl,
              image: post.thumbnail || null,
              description: NoiseFilterHelper.cleanDescription(post.short_description),
              eventDate: post.published_at ? new Date(post.published_at) : null,
              eventTime: post.published_at ? new Date(post.published_at).toTimeString().substring(0, 5) : null,
              rawData: { sourceUrl: target.targetUrls[0] || articleUrl, sforumId: post.id },
            });
          }

          if (meta && meta.current_page >= meta.total_pages) break;
          await new Promise((r) => setTimeout(r, 400));
        } catch (err) {
          break;
        }
      }
    }

    return items;
  }

  private async fetchConfiguredAjaxPages(target: CrawlTarget, baseUrl: string): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];
    let slug = '';
    try {
      const pathname = new URL(baseUrl).pathname.replace(/\/$/, '');
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length > 0) slug = parts[parts.length - 1];
    } catch {
      slug = '';
    }

    let payload = (target.ajaxPayload || 'page={page}').replace('{slug}', encodeURIComponent(slug));
    if (payload.includes('ID=') && /^\d+$/.test(slug)) {
      payload = payload.replace(/ID=\d+/, `ID=${slug}`);
    }
    if (payload.includes('Size=10')) {
      payload = payload.replace('Size=10', 'Size=20');
    }

    const totalPages = 5;
    for (let page = 1; page <= totalPages; page++) {
      const body = payload.replace('{page}', page.toString());
      const response = await this.httpClient.postAjax(target.ajaxEndpoint!, body, baseUrl);
      if (!response || response.length < 100) break;

      const $ = cheerio.load(response);
      $('article, li[data-id], .vts_post, .post, .item').each((_, el) => {
        const art = $(el);
        const titleAttr = art.find('a[title]').first().attr('title');
        const titleText = art.find('h2, h3, .title, .vts_title, a').first().text().replace(/\s+/g, ' ').trim();
        const title = NoiseFilterHelper.cleanTitle(titleAttr || titleText);
        const link = art.find('a[href]').first().attr('href');

        if (!title || !link || NoiseFilterHelper.isNoiseTitle(title)) return;

        const dateText = art.find('time, .date, .time, .vts_date, span[class*="date"]').first().text().trim();
        const img = art.find('img').first().attr('src') || art.find('img').first().attr('data-src') || null;
        const resolvedUrl = UrlNormalizerHelper.resolveUrl(baseUrl, link);
        const parsedDate = DateExtractorHelper.parsePublishedDate(dateText);

        items.push({
          title,
          url: resolvedUrl,
          image: img && !NoiseFilterHelper.isNoiseImage(img) ? UrlNormalizerHelper.resolveUrl(baseUrl, img) : null,
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
