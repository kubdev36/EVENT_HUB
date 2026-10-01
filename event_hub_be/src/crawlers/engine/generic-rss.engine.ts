import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { ParsedCrawlItem } from '../crawler.types.js';
import { CrawlerHttpClient } from './crawler-http.client.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';

@Injectable()
export class GenericRssEngine {
  constructor(private readonly httpClient: CrawlerHttpClient) {}

  async fetchRssOrSitemap(url: string): Promise<ParsedCrawlItem[]> {
    const resp = await this.httpClient.fetchHtml(url);
    if (!resp?.html) return [];

    const items: ParsedCrawlItem[] = [];
    const isXml = resp.html.includes('<rss') || resp.html.includes('<feed') || resp.html.includes('<?xml') || resp.html.includes('<urlset');
    if (!isXml) return [];

    const $ = cheerio.load(resp.html, { xmlMode: true });

    // 1. Standard RSS (<item>)
    $('item').each((_, el) => {
      const itemNode = $(el);
      const title = NoiseFilterHelper.cleanTitle(itemNode.find('title').text().trim());
      const link = itemNode.find('link').text().trim() || itemNode.find('guid').text().trim();
      const descRaw = itemNode.find('description, content\\:encoded').text().trim();
      const pubDateText = itemNode.find('pubDate, dc\\:date').text().trim();

      if (!title || !link || NoiseFilterHelper.isNoiseTitle(title)) return;

      // Extract image
      let image = itemNode.find('enclosure[type*="image"]').attr('url') ||
                  itemNode.find('media\\:content[medium="image"]').attr('url') ||
                  itemNode.find('media\\:thumbnail').attr('url') || null;

      if (!image && descRaw) {
        const descMatch = descRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (descMatch) image = descMatch[1];
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
      const title = NoiseFilterHelper.cleanTitle(entryNode.find('title').text().trim());
      const link = entryNode.find('link[rel="alternate"]').attr('href') || entryNode.find('link').attr('href') || '';
      const summary = entryNode.find('summary, content').text().trim();
      const published = entryNode.find('published, updated').text().trim();

      if (!title || !link || NoiseFilterHelper.isNoiseTitle(title)) return;

      let image = entryNode.find('link[rel="enclosure"]').attr('href') || null;
      if (!image && summary) {
        const descMatch = summary.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (descMatch) image = descMatch[1];
      }

      const parsedDate = DateExtractorHelper.parsePublishedDate(published);
      items.push({
        title,
        url: link,
        image: image && !NoiseFilterHelper.isNoiseImage(image) ? image : null,
        description: NoiseFilterHelper.cleanDescription(summary),
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
        const title = NoiseFilterHelper.cleanTitle(urlNode.find('news\\:title, title').text().trim());
        const pubDate = urlNode.find('news\\:publication_date, lastmod').text().trim();

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

    return items;
  }
}
