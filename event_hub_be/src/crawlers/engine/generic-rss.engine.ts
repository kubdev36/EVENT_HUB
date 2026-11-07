import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { ParsedCrawlItem } from '../crawler.types.js';
import { CrawlerHttpClient, CrawlFetchError } from './crawler-http.client.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';

@Injectable()
export class GenericRssEngine {
  private readonly logger = new Logger(GenericRssEngine.name);

  constructor(private readonly httpClient: CrawlerHttpClient) {}

  async fetchRssOrSitemap(url: string): Promise<ParsedCrawlItem[]> {
    const resp = await this.httpClient.requirePage(url);

    const items: ParsedCrawlItem[] = [];
    const isXml =
      resp.html.includes('<rss') ||
      resp.html.includes('<feed') ||
      resp.html.includes('<?xml') ||
      resp.html.includes('<urlset');
    if (!isXml)
      throw new CrawlFetchError(
        'failed',
        url,
        'Nội dung trả về không phải RSS/Atom/sitemap',
      );

    const $ = cheerio.load(resp.html, { xmlMode: true });

    // 1. Standard RSS (<item>)
    $('item').each((_, el) => {
      const itemNode = $(el);
      const title = NoiseFilterHelper.cleanTitle(
        itemNode.find('title').text().trim(),
      );
      const link =
        itemNode.find('link').text().trim() ||
        itemNode.find('guid').text().trim();
      const descRaw =
        itemNode.find('description').text().trim() ||
        itemNode.find('encoded').text().trim() ||
        itemNode.html() ||
        '';
      const pubDateText = itemNode.find('pubDate, dc\\:date').text().trim();

      if (!title || !link || NoiseFilterHelper.isNoiseTitle(title)) return;

      // Extract image from tags or HTML
      let image =
        itemNode.find('enclosure[type*="image"]').attr('url') ||
        itemNode.find('enclosure').attr('url') ||
        itemNode.find('media\\:content[medium="image"]').attr('url') ||
        itemNode.find('media\\:content').attr('url') ||
        itemNode.find('media\\:thumbnail').attr('url') ||
        null;

      if (!image && descRaw) {
        const descMatch =
          descRaw.match(/<img[^>]+src=["']([^"']+)["']/i) ||
          descRaw.match(/https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp|avif)/i);
        if (descMatch) image = descMatch[1] || descMatch[0];
      }

      const parsedDate = DateExtractorHelper.parsePublishedDate(pubDateText);

      items.push({
        title,
        url: link,
        image: image && !NoiseFilterHelper.isNoiseImage(image) ? image : null,
        description: NoiseFilterHelper.cleanDescription(descRaw),
        eventDate: parsedDate?.date || null,
        eventTime: parsedDate?.time || null,
        rawData: { sourceUrl: resp.url, kind: 'rss' },
      });
    });

    // 2. Atom Feed (<entry>)
    $('entry').each((_, el) => {
      const entryNode = $(el);
      const title = NoiseFilterHelper.cleanTitle(
        entryNode.find('title').text().trim(),
      );
      const link =
        entryNode.find('link[rel="alternate"]').attr('href') ||
        entryNode.find('link').attr('href') ||
        '';
      const contentRaw =
        entryNode.find('content').text() ||
        entryNode.find('summary').text() ||
        entryNode.html() ||
        '';
      const published = entryNode.find('published, updated').text().trim();

      if (!title || !link || NoiseFilterHelper.isNoiseTitle(title)) return;

      let image: string | null = null;
      entryNode.find('link').each((_, linkEl) => {
        const rel = $(linkEl).attr('rel');
        const type = $(linkEl).attr('type') || '';
        const href = $(linkEl).attr('href');
        if (
          href &&
          (rel === 'enclosure' || type.startsWith('image/')) &&
          !image
        ) {
          image = href;
        }
      });

      if (!image) {
        image =
          entryNode.find('enclosure').attr('url') ||
          entryNode.find('media\\:content').attr('url') ||
          null;
      }

      if (!image && contentRaw) {
        const unescaped = contentRaw
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
        const descMatch =
          unescaped.match(/<img[^>]+src=["']([^"']+)["']/i) ||
          unescaped.match(
            /https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp|avif|image)/i,
          );
        if (descMatch) image = descMatch[1] || descMatch[0];
      }

      const parsedDate = DateExtractorHelper.parsePublishedDate(published);
      items.push({
        title,
        url: link,
        image: image && !NoiseFilterHelper.isNoiseImage(image) ? image : null,
        description: NoiseFilterHelper.cleanDescription(contentRaw),
        eventDate: parsedDate?.date || null,
        eventTime: parsedDate?.time || null,
        rawData: { sourceUrl: resp.url, kind: 'atom' },
      });
    });

    // 3. Google News Sitemap (<urlset><url><loc>)
    if ($('urlset, url').length > 0) {
      $('url').each((_: number, el: AnyNode) => {
        const urlNode = $(el);
        const loc = urlNode.find('loc').text().trim();
        const title = NoiseFilterHelper.cleanTitle(
          urlNode.find('news\\:title, title').text().trim(),
        );
        const pubDate = urlNode
          .find('news\\:publication_date, lastmod')
          .text()
          .trim();

        if (loc && title && !NoiseFilterHelper.isNoiseTitle(title)) {
          const parsedDate = DateExtractorHelper.parsePublishedDate(pubDate);
          items.push({
            title,
            url: loc,
            image: null,
            description: null,
            eventDate: parsedDate?.date || null,
            eventTime: parsedDate?.time || null,
            rawData: { sourceUrl: resp.url, kind: 'sitemap' },
          });
        }
      });
    }

    // Ảnh còn thiếu được lấy ở bước crawl hai bước, chỉ cho bài mới (CrawlerService).
    return items;
  }
}
