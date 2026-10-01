import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { ParsedCrawlItem } from '../crawler.types.js';
import { CrawlerHttpClient } from './crawler-http.client.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';

@Injectable()
export class GenericHtmlEngine {
  constructor(private readonly httpClient: CrawlerHttpClient) {}

  async fetchHtmlItems(url: string): Promise<ParsedCrawlItem[]> {
    const resp = await this.httpClient.fetchHtml(url);
    if (!resp?.html) return [];

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

  private extractNextJsPayload(html: string, sourceUrl: string): ParsedCrawlItem[] {
    const items: ParsedCrawlItem[] = [];
    if (!html.includes('self.__next_f') && !html.includes('__NEXT_DATA__')) return items;

    // Scan for JSON post objects in Next.js payloads
    const matches = html.matchAll(/"title"\s*:\s*"([^"]{8,150})"[^}]*?"(slug|url)"\s*:\s*"([^"]+)"/g);
    for (const match of matches) {
      const title = NoiseFilterHelper.cleanTitle(match[1]);
      const slugOrUrl = match[3];
      if (!title || !slugOrUrl || NoiseFilterHelper.isNoiseTitle(title)) continue;

      const fullUrl = slugOrUrl.startsWith('http')
        ? slugOrUrl
        : UrlNormalizerHelper.resolveUrl(sourceUrl, slugOrUrl.startsWith('/') ? slugOrUrl : `/${slugOrUrl}`);

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

  private extractFromEventBlocks($: cheerio.CheerioAPI, sourceUrl: string): ParsedCrawlItem[] {
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

      const link = block.find('a[href]').first().attr('href') || block.attr('href');
      if (!title || !link || NoiseFilterHelper.isNoiseTitle(title)) return;

      const fullUrl = UrlNormalizerHelper.resolveUrl(sourceUrl, link);
      if (!UrlNormalizerHelper.isLikelyEventUrl(fullUrl)) return;

      const img = block.find('img').first().attr('src') ||
                  block.find('img').first().attr('data-src') ||
                  block.find('img').first().attr('data-original') || null;

      const dateText = block.find('time, .date, .time, span[class*="date"]').first().text().trim();
      const parsedDate = DateExtractorHelper.parsePublishedDate(dateText);
      const desc = block.find('p, .desc, .summary, .description').first().text().trim();

      items.push({
        title,
        url: fullUrl,
        image: img && !NoiseFilterHelper.isNoiseImage(img) ? UrlNormalizerHelper.resolveUrl(sourceUrl, img) : null,
        description: NoiseFilterHelper.cleanDescription(desc),
        eventDate: parsedDate?.date || null,
        eventTime: parsedDate?.time || null,
        rawData: { sourceUrl, kind: 'html-block' },
      });
    });

    return items;
  }

  private extractFromMetadata($: cheerio.CheerioAPI, sourceUrl: string): ParsedCrawlItem[] {
    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    const cleanTitle = NoiseFilterHelper.cleanTitle(title);
    if (!cleanTitle || NoiseFilterHelper.isNoiseTitle(cleanTitle)) return [];

    const desc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || null;
    const image = $('meta[property="og:image"]').attr('content') || null;
    const pubDate = $('meta[property="article:published_time"]').attr('content') || null;
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
