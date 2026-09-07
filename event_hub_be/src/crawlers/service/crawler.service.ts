import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { createHash } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { Repository } from 'typeorm';
import { ClassifierService } from '../../classifier/classifier.service.js';
import { CrawlerRun } from '../../crawler-runs/entity/crawler-run.entity.js';
import { Event } from '../../events/entity/event.entity.js';
import { Setting } from '../../settings/entity/setting.entity.js';
import { TelegramService } from '../../telegram/telegram.service.js';
import { CrawlSource, CrawlTarget, KeywordRule, ParsedCrawlItem } from '../crawler.types.js';

@Injectable()
export class CrawlerService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(CrawlerRun)
    private readonly crawlerRunRepository: Repository<CrawlerRun>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly classifierService: ClassifierService,
    private readonly telegramService: TelegramService,
  ) {}

  async crawlAllSources() {
    return this.crawlAllTargets();
  }

  async crawlAllTargets() {
    const targets = (await this.getCrawlerTargets()).filter((target) => target.enabled !== false);
    return Promise.all(targets.map((target) => this.crawlTargetSafely(target)));
  }

  async crawlSourceById(id: string) {
    return this.crawlTargetById(id);
  }

  async crawlTargetById(id: string) {
    const target = await this.getCrawlerTargetById(id);
    return this.crawlTarget(target);
  }

  async crawlSource(source: CrawlSource) {
    return this.crawlTarget(source);
  }

  async crawlTarget(target: CrawlTarget) {
    const run = await this.crawlerRunRepository.save(
      this.crawlerRunRepository.create({
        sourceId: target.id,
        sourceName: target.name,
        status: 'running',
        startedAt: new Date(),
        itemsFound: 0,
        newItems: 0,
        errorMessage: null,
      }),
    );

    try {
      const items = await this.fetchItemsFromTarget(target);
      const rules = await this.getKeywordRules();
      const seen = new Set<string>();
      let newItems = 0;

      const batchSize = 10;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const validBatch: ParsedCrawlItem[] = [];
        for (const item of batch) {
          const cleanUrl = this.normalizeUrl(item.url);
          if (!cleanUrl || seen.has(cleanUrl)) continue;
          seen.add(cleanUrl);
          validBatch.push(item);
        }

        for (const item of validBatch) {
          const type = this.classifierService.classify(item.title, item.description || '', rules);
          if (!type) continue;

          const existing = await this.findExistingEvent(target, item);

          if (existing) {
            existing.lastSeenAt = new Date();
            if (item.title && /[\u00C0-\u024F\u1EA0-\u1EF9]/u.test(item.title) && (!/[\u00C0-\u024F\u1EA0-\u1EF9]/u.test(existing.title) || existing.title.length < item.title.length)) {
              existing.title = item.title;
            }
            existing.description = item.description ?? existing.description;
            if (item.image && !item.image.startsWith('data:') && !this.isNoiseImage(item.image)) {
              existing.image = item.image;
            }
            // Always update date from enriched item (detail page already fetched by enrichItemDetails)
            if (item.eventDate && !isNaN(item.eventDate.getTime()) && Math.abs(item.eventDate.getTime() - Date.now()) > 60000) {
              existing.eventDate = item.eventDate;
              existing.eventTime = item.eventTime ?? existing.eventTime;
            }
            existing.eventTime = item.eventTime ?? existing.eventTime;
            existing.rawData = item.rawData ?? existing.rawData;
            existing.type = type;
            await this.eventRepository.save(existing);
            continue;
          }

          const event = await this.createOrMergeEvent(target, item, type);
          if (!event) continue;

          newItems += 1;
          await this.notifyNewCrawlerEvent(event);
        }
      }

      run.status = 'success';
      run.itemsFound = items.length;
      run.newItems = newItems;
      run.finishedAt = new Date();
      await this.crawlerRunRepository.save(run);

      return {
        sourceId: target.id,
        sourceName: target.name,
        type: target.type || 'web',
        itemsFound: items.length,
        newItems,
        status: 'success',
      };
    } catch (error) {
      run.status = 'failed';
      run.errorMessage = error instanceof Error ? error.message : 'Unknown crawler error';
      run.finishedAt = new Date();
      await this.crawlerRunRepository.save(run);
      throw error;
    }
  }

  private async crawlTargetSafely(target: CrawlTarget) {
    try {
      return await this.crawlTarget(target);
    } catch (error) {
      return {
        sourceId: target.id,
        sourceName: target.name,
        type: target.type || 'web',
        itemsFound: 0,
        newItems: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown crawler error',
      };
    }
  }

  private async getCrawlerTargets(): Promise<CrawlTarget[]> {
    const setting = await this.settingRepository.findOne({ where: { key: 'crawler_sources' } });
    if (!setting?.value) return [];
    if (Array.isArray(setting.value)) return setting.value as CrawlTarget[];
    if (typeof setting.value === 'object') {
      const obj = setting.value as { targets?: CrawlTarget[]; sources?: CrawlTarget[] };
      if (Array.isArray(obj.targets)) return obj.targets;
      if (Array.isArray(obj.sources)) return obj.sources;
    }
    return [];
  }

  private async getCrawlerTargetById(id: string): Promise<CrawlTarget> {
    const targets = await this.getCrawlerTargets();
    const target = targets.find((item) => item.id === id);
    if (!target) throw new Error('Crawler target not found.');
    return target;
  }

  private async getKeywordRules(): Promise<KeywordRule[]> {
    const setting = await this.settingRepository.findOne({ where: { key: 'keyword_rules' } });
    const value = setting?.value;

    if (Array.isArray(value)) {
      return this.normalizeKeywordRules(value);
    }

    if (value && typeof value === 'object' && Array.isArray((value as { rules?: unknown[] }).rules)) {
      return this.normalizeKeywordRules((value as { rules: unknown[] }).rules);
    }

    return [];
  }

  private normalizeKeywordRules(value: unknown[]): KeywordRule[] {
    const rules: KeywordRule[] = [];

    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const rule = item as { type?: unknown; label?: unknown; keywords?: unknown };
      const type = String(rule.type || '').trim();
      const keywords = String(rule.keywords || '').trim();

      if (!type || !keywords) continue;

      rules.push({
        type,
        label: typeof rule.label === 'string' ? rule.label : undefined,
        keywords,
      });
    }

    return rules;
  }

  private async fetchItemsFromTarget(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    if (target.type === 'facebook') {
      return this.fetchFacebookItems(target);
    }

    return this.fetchWebItems(target);
  }

  private async fetchFacebookItems(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];

    for (const url of target.targetUrls || []) {
      const response = await this.fetchHtml(url);
      if (!response) continue;

      const $ = cheerio.load(response.html);
      const metadataItems = this.extractFromMetadata($, response.url);

      items.push(
        ...metadataItems.map((item) => ({
          ...item,
          rawData: { ...item.rawData, kind: 'facebook-best-effort', sourceUrl: response.url },
        })),
      );
    }

    return this.dedupeAndRankItems(items);
  }

  private async fetchWebItems(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    const htmlItems = await this.fetchHtmlAndRssItems(target);
    const dynamicItems = await this.fetchDynamicApiItems(target);
    const allItems = [...htmlItems, ...dynamicItems];

    return await this.dedupeAndRankItems(allItems, target);
  }

  /**
   * HÀM 1: Cào HTML & RSS chuẩn dành cho 90% website tin tức thông thường
   */
  private async fetchHtmlAndRssItems(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];
    const seenUrls = new Set<string>();

    for (const baseUrl of target.targetUrls || []) {
      const urlsToCrawl = [baseUrl];

      // Auto add pagination pages for standard news sites (excluding custom AJAX stores and Sforum/CellphoneS which uses feeds)
      const isCustomAjaxSite = !!(target.ajaxEndpoint || target.paginationType === 'ajax' || target.paginationType === 'none');
      const isSforum = baseUrl.includes('cellphones.com.vn') || baseUrl.includes('sforum.vn');
      if ((baseUrl.includes('category') || baseUrl.includes('tin-tuc') || baseUrl.includes('khuyen-mai')) && !isCustomAjaxSite && !isSforum) {
        for (let p = 2; p <= 15; p++) {
          const pPage = baseUrl.includes('?') ? `${baseUrl}&page=${p}` : (baseUrl.endsWith('/') ? `${baseUrl}page/${p}/` : `${baseUrl}/page/${p}/`);
          const pTrang = baseUrl.endsWith('/') ? `${baseUrl}trang-${p}` : `${baseUrl}/trang-${p}`;
          urlsToCrawl.push(pPage, pTrang);
        }
      }

      // Parallel batch fetching for static web pages (concurrency: 5)
      const batchSize = 5;
      for (let i = 0; i < urlsToCrawl.length; i += batchSize) {
        const batch = urlsToCrawl.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (currentUrl) => {
            const response = await this.fetchHtml(currentUrl);
            if (!response) return;

            const $ = cheerio.load(response.html);
            // urlsToCrawl are listing pages; extract actual events from blocks, links, and payloads
            items.push(...(await this.extractFromEventBlocks($, response.url)));
            items.push(...(await this.extractFromLinks($, response.url)));
            items.push(...this.extractNextJsPayload(response.html, response.url));

            if (response.html.includes('<rss') || response.html.includes('<feed') || response.html.includes('<?xml')) {
              const $rss = cheerio.load(response.html, { xmlMode: true });
              items.push(...this.extractFromRss($rss, response.url));
            }
          }),
        );
      }

      // Fetch RSS feed ONCE per baseUrl if available
      if (!baseUrl.includes('/feed')) {
        const feedUrl = baseUrl.endsWith('/') ? `${baseUrl}feed/` : `${baseUrl}/feed/`;
        const feedResp = await this.fetchHtml(feedUrl);
        if (feedResp && (feedResp.html.includes('<rss') || feedResp.html.includes('<feed') || feedResp.html.includes('<?xml'))) {
          const $rss = cheerio.load(feedResp.html, { xmlMode: true });
          items.push(...this.extractFromRss($rss, feedResp.url));
        }
      }


      // Fetch CellphoneS official promo & event articles via Sforum GraphQL API
      if (baseUrl.includes('cellphones.com.vn') || baseUrl.includes('sforum.vn')) {
        const SFORUM_GQL = 'https://api.sforum.vn/graphql/query';
        // Category IDs discovered from Sforum's frontend: 10078 = "Tin khuyến mãi" (khuyen-mai-soc), 27510 = "Sự kiện" (su-kien)
        const categoryIds = [10078, 27510];
        const gqlHeaders = {
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'origin': 'https://cellphones.com.vn',
          'referer': 'https://cellphones.com.vn/sforum/khuyen-mai-soc',
        };

        for (const catId of categoryIds) {
          // Fetch up to 5 pages (20 per page = 100 articles per category)
          for (let page = 1; page <= 5; page++) {
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
                items.push({
                  title: post.title || '',
                  url: articleUrl,
                  image: post.thumbnail || null,
                  description: post.short_description || null,
                  eventDate: post.published_at ? new Date(post.published_at) : null,
                  eventTime: post.published_at ? new Date(post.published_at).toTimeString().substring(0, 5) : null,
                  rawData: { sourceUrl: baseUrl, sforumId: post.id },
                });
              }

              // Stop paginating if we've reached the last page
              if (meta && meta.current_page >= meta.total_pages) break;
              await new Promise((r) => setTimeout(r, 200));
            } catch (err: any) {
              console.error(`[CellphoneS GQL] Error fetching category ${catId} page ${page}: ${err?.message || err}`);
              break;
            }
          }
        }
      }


      // Fetch Hoang Ha Mobile RSS feed & category feeds
      if (baseUrl.includes('hoanghamobile.com')) {
        const hhFeeds: string[] = [];
        // Khuyến mãi category (up to 15 pages = ~150 items)
        for (let p = 1; p <= 15; p++) {
          hhFeeds.push(p === 1 ? 'https://hoanghamobile.com/tin-tuc/category/khuyen-mai/feed/' : `https://hoanghamobile.com/tin-tuc/category/khuyen-mai/feed/?paged=${p}`);
        }
        // Tin hot category (up to 8 pages = ~80 items)
        for (let p = 1; p <= 8; p++) {
          hhFeeds.push(p === 1 ? 'https://hoanghamobile.com/tin-tuc/category/tin-cong-nghe/tin-hot/feed/' : `https://hoanghamobile.com/tin-tuc/category/tin-cong-nghe/tin-hot/feed/?paged=${p}`);
        }
        // Đánh giá category (up to 5 pages)
        for (let p = 1; p <= 5; p++) {
          hhFeeds.push(p === 1 ? 'https://hoanghamobile.com/tin-tuc/category/danh-gia/feed/' : `https://hoanghamobile.com/tin-tuc/category/danh-gia/feed/?paged=${p}`);
        }
        // General feed (up to 10 pages = ~100 items)
        for (let p = 1; p <= 10; p++) {
          hhFeeds.push(p === 1 ? 'https://hoanghamobile.com/tin-tuc/feed/' : `https://hoanghamobile.com/tin-tuc/feed/?paged=${p}`);
        }

        for (const feedUrl of hhFeeds) {
          const feedResp = await this.fetchHtml(feedUrl);
          if (feedResp?.html) {
            if (feedResp.html.includes('<rss') || feedResp.html.includes('<feed') || feedResp.html.includes('<?xml')) {
              const $rss = cheerio.load(feedResp.html, { xmlMode: true });
              items.push(...this.extractFromRss($rss, feedResp.url));
            }
          }
           await new Promise((r) => setTimeout(r, 200));
        }
      }

      // Fetch FPT Shop RSS feeds & Google News sitemap
      if (baseUrl.includes('fptshop.com.vn')) {
        const fptFeeds = [
          'https://fptshop.com.vn/news/rss/tin-moi.rss',
          'https://fptshop.com.vn/news/rss/danh-gia.rss',
          'https://fptshop.com.vn/news/rss/dien-may.rss',
          'https://fptshop.com.vn/news/rss/news-new.rss',       // 100 latest articles
          'https://fptshop.com.vn/news/google-news.xml',         // 362 articles with dates
        ];
        for (const feedUrl of fptFeeds) {
          const feedResp = await this.fetchHtml(feedUrl);
          if (feedResp?.html) {
            if (feedResp.html.includes('<rss') || feedResp.html.includes('<feed') || feedResp.html.includes('<?xml')) {
              const $rss = cheerio.load(feedResp.html, { xmlMode: true });
              items.push(...this.extractFromRss($rss, feedResp.url));
              // Also extract from sitemap <url><loc> format (google-news.xml)
              if (feedResp.html.includes('<urlset') || feedResp.html.includes('<url>')) {
                $rss('url').each((_: number, el: AnyNode) => {
                  const loc = $rss(el).find('loc').text().trim();
                  const title = $rss(el).find('news\\:title, title').text().trim();
                  const pubDate = $rss(el).find('news\\:publication_date, lastmod').text().trim();
                  if (loc && loc.includes('/tin-tuc/') && title) {
                    items.push({
                      title,
                      url: loc,
                      image: null,
                      description: null,
                      eventDate: pubDate ? new Date(pubDate) : null,
                    });
                  }
                });
              }
            }
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    return items;
  }

  /**
   * HÀM 2: Cào API / AJAX động (100% Tự động - Không hardcode câu lệnh if theo trang)
   */
  private async fetchDynamicApiItems(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];

    for (const baseUrl of target.targetUrls || []) {
      // 1. Ưu tiên cấu hình Endpoint AJAX từ Database / UI
      if (target.ajaxEndpoint) {
        items.push(...(await this.fetchGenericConfiguredAjaxPages(target, baseUrl)));
        continue;
      }

      // 2. Tự động phát hiện cấu hình AJAX từ mã nguồn HTML (Auto-Discovery)
      const pageResp = await this.fetchHtml(baseUrl);
      if (!pageResp) continue;

      const detectedConfigs = this.detectAjaxConfigsFromHtml(pageResp.html, baseUrl);
      for (const config of detectedConfigs) {
        items.push(...(await this.fetchGenericAjaxPages(config, baseUrl)));
      }
    }

    return items;
  }

  private detectAjaxConfigsFromHtml(html: string, baseUrl: string): Array<{ endpoint: string; payload: string; totalPages: number }> {
    const configs: Array<{ endpoint: string; payload: string; totalPages: number }> = [];
    const lowerUrl = baseUrl.toLowerCase();

    let origin = '';
    try {
      origin = new URL(baseUrl).origin;
    } catch {
      return configs;
    }

    // 1. Pattern ASP.NET WebForms AJAX Action Endpoint (ViettelStore, etc.)
    if (html.includes('AjaxAction.aspx') || html.includes('get-news-rest-api') || lowerUrl.includes('viettelstore')) {
      let slug = 'tin-khuyen-mai';
      try {
        const pathname = new URL(baseUrl).pathname.replace(/\/$/, '');
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length > 0) slug = parts[parts.length - 1];
      } catch {
        slug = 'tin-khuyen-mai';
      }

      configs.push({
        endpoint: `${origin}/AjaxAction.aspx`,
        payload: `action=get-news-rest-api-theme-5&slug=${encodeURIComponent(slug)}&keyword=&pageSize=15&currentPage={page}&specOrder=DESC&topNews=0`,
        totalPages: 30,
      });
    }

    // 2. Pattern ASP.NET MVC Box AJAX Endpoint (TGDD, etc.)
    if (html.includes('/aj/Home/Box') || html.includes('ID=1169') || html.includes('aj/Home') || lowerUrl.includes('thegioididong') || lowerUrl.includes('tgdd')) {
      configs.push({
        endpoint: `${origin}/tin-tuc/aj/Home/Box`,
        payload: `ID=1169&Size=10&Index={page}`,
        totalPages: 30,
      });
    }

    return configs;
  }

  private async fetchGenericConfiguredAjaxPages(target: CrawlTarget, baseUrl: string): Promise<ParsedCrawlItem[]> {
    let slug = '';
    try {
      const pathname = new URL(baseUrl).pathname.replace(/\/$/, '');
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length > 0) slug = parts[parts.length - 1];
    } catch {
      slug = '';
    }

    let payload = (target.ajaxPayload || 'page={page}').replace('{slug}', encodeURIComponent(slug));

    // TGDD: Replace hardcoded ID with actual category ID from URL (e.g. /tin-khuyen-mai/31 → ID=31)
    if (payload.includes('ID=') && /^\d+$/.test(slug)) {
      payload = payload.replace(/ID=\d+/, `ID=${slug}`);
    }
    // TGDD: Increase page size for better coverage
    if (payload.includes('Size=10')) {
      payload = payload.replace('Size=10', 'Size=20');
    }

    return this.fetchGenericAjaxPages(
      {
        endpoint: target.ajaxEndpoint!,
        payload,
        totalPages: 30,
      },
      baseUrl,
    );
  }

  private async fetchGenericAjaxPages(
    config: { endpoint: string; payload: string; totalPages: number },
    baseUrl: string,
  ): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];
    const seen = new Set<string>();
    const pages = Array.from({ length: config.totalPages }, (_, i) => i + (config.payload.includes('Index=') ? 0 : 1));

    const batchSize = 4;
    let emptyBatchCount = 0;
    for (let i = 0; i < pages.length; i += batchSize) {
      if (emptyBatchCount >= 2) break;

      const batch = pages.slice(i, i + batchSize);
      const initialCount = items.length;
      await Promise.all(
        batch.map(async (page) => {
          const body = config.payload.replace('{page}', page.toString());
          const response = await this.postAjax(config.endpoint, body, baseUrl);
          if (!response || response.length < 100) return;

          const $ = cheerio.load(response);
          $('article, li[data-id], .vts_post, .post, .item').each((idx, el) => {
            const art = $(el);
            const titleAttr = art.find('a[title]').first().attr('title');
            const titleText = art.find('h2, h3, .title, .vts_title, a').first().text().replace(/\s+/g, ' ').trim();
            const title = (titleAttr || titleText).replace(/\s+/g, ' ').trim();

            const link = art.find('a[href]').first().attr('href');
            const dateText = art.find('time, .date, .time, .vts_date, span[class*="date"], span[class*="time"]').first().text().trim();
            const imgEl = art.find('img').first();
            const dataOrig = imgEl.attr('data-original');
            const dataSrc = imgEl.attr('data-src');
            const lazySrc = imgEl.attr('data-lazy-src');
            const rawSrc = imgEl.attr('src');
            const candidates = [dataOrig, dataSrc, lazySrc, rawSrc].filter(
              (s): s is string => !!s && !s.startsWith('data:'),
            );
            const img = candidates.length > 0 ? candidates[0] : null;

            if (link && title && title.length > 10) {
              let fullUrl = link;
              try {
                fullUrl = link.startsWith('http') ? link : new URL(link, baseUrl).toString();
              } catch {
                fullUrl = link;
              }

              if (!seen.has(fullUrl)) {
                seen.add(fullUrl);
                let fullImg = img;
                if (img && !img.startsWith('data:')) {
                  try {
                    fullImg = img.startsWith('http') ? img : new URL(img, baseUrl).toString();
                  } catch {
                    fullImg = img;
                  }
                }

                const parsedDate = this.parsePublishedDate(dateText) || this.parsePublishedDate(title);
                const itemDate: Date | null = parsedDate?.date ?? null;

                if (itemDate && itemDate < new Date('2025-01-01')) {
                  return;
                }

                items.push({
                  title: this.cleanTitle(title),
                  description: null,
                  image: fullImg,
                  url: fullUrl,
                  eventDate: itemDate,
                  score: 4,
                  rawData: { kind: 'dynamic-ajax', page },
                });
              }
            }
          });
        }),
      );

      if (items.length === initialCount) {
        emptyBatchCount++;
      } else {
        emptyBatchCount = 0;
      }
    }

    return items;
  }

  private postAjax(url: string, body: string, referer: string): Promise<string | null> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'content-length': Buffer.byteLength(body).toString(),
          'x-requested-with': 'XMLHttpRequest',
          referer,
        },
      };

      const request = client.request(options, (response) => {
        let data = '';
        response.on('data', (chunk: Buffer | string) => { data += chunk; });
        response.on('end', () => resolve(data));
      });

      request.setTimeout(15000, () => { request.destroy(); resolve(null); });
      request.on('error', () => resolve(null));
      request.write(body);
      request.end();
    });
  }

  private async fetchHtml(url: string): Promise<{ url: string; html: string } | null> {
    if (!url || !url.startsWith('http')) return null;

    const urlsToTry = [url];
    // For WordPress URLs without query params or trailing slash, prepare trailing slash variant
    if (!url.endsWith('/') && !url.includes('?') && !url.endsWith('.xml') && !url.endsWith('.html')) {
      urlsToTry.push(`${url}/`);
    }

    for (const attemptUrl of urlsToTry) {
      for (let retry = 0; retry < 2; retry += 1) {
        try {
          let refererHeader = 'https://www.google.com/';
          try {
            const u = new URL(attemptUrl);
            refererHeader = `${u.origin}/`;
          } catch {}

          const isFeed = attemptUrl.includes('feed') || attemptUrl.endsWith('.xml');
          const reqHeaders: Record<string, string> = {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            accept: isFeed
              ? 'application/rss+xml, application/xml, text/xml, */*'
              : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            referer: refererHeader,
            'cache-control': 'no-cache',
            pragma: 'no-cache',
          };
          if (!isFeed) {
            reqHeaders['sec-ch-ua'] = '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"';
            reqHeaders['sec-ch-ua-mobile'] = '?0';
            reqHeaders['sec-ch-ua-platform'] = '"Windows"';
            reqHeaders['sec-fetch-dest'] = 'document';
            reqHeaders['sec-fetch-mode'] = 'navigate';
            reqHeaders['sec-fetch-site'] = 'none';
            reqHeaders['sec-fetch-user'] = '?1';
            reqHeaders['upgrade-insecure-requests'] = '1';
          }

          const resp = await fetch(attemptUrl, {
            headers: reqHeaders,
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
          });

          if (!resp.ok) {
            try {
              await resp.body?.cancel();
            } catch {}
            continue;
          }
          const html = await resp.text();
          if (html.includes('BytePlus') && html.includes('Security Check')) {
            // WAF challenge intercepted, skip treating as valid content
            return null;
          }
          return { url: resp.url || attemptUrl, html };
        } catch {
          if (retry === 1) break;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }

    return null;
  }

  private extractFromMetadata($: cheerio.CheerioAPI, sourceUrl: string): ParsedCrawlItem[] {
    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;
    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[property="og:image:secure_url"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[name="twitter:image:src"]').attr('content') ||
      this.extractJsonLdImage($) ||
      null;
    let canonical = $('link[rel="canonical"]').attr('href') || sourceUrl;
    if (canonical && sourceUrl && canonical !== sourceUrl) {
      const cNorm = canonical.toLowerCase().replace(/\/$/, '');
      if (cNorm.endsWith('/tin-tuc') || cNorm.endsWith('/tin-khuyen-mai') || cNorm === 'https://fptshop.com.vn') {
        canonical = sourceUrl;
      }
    }
    const published = this.parsePublishedDate(
      $('meta[property="article:published_time"]').attr('content') ||
        $('meta[property="og:updated_time"]').attr('content') ||
        $('meta[name="pubdate"]').attr('content') ||
        $('time[datetime]').first().attr('datetime') ||
        $('time').first().text().trim() ||
        null,
    );

    if (!title) return [];
    if (this.isGenericListingPage(title, sourceUrl, description || '')) return [];

    return [
      {
        title: title.trim(),
        description: description?.trim() || null,
        image: image ? this.resolveUrl(sourceUrl, image) : null,
        url: this.resolveUrl(sourceUrl, canonical),
        eventDate: published?.date ?? null,
        eventTime: published?.time ?? null,
        score: 2,
        rawData: { kind: 'metadata', sourceUrl },
      },
    ];
  }

  private extractFromRss($: cheerio.CheerioAPI, sourceUrl: string): ParsedCrawlItem[] {
    const items: ParsedCrawlItem[] = [];
    const elements = $('item, entry').toArray();

    for (const el of elements) {
      const item = $(el);
      const title = item.find('title').first().text().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      const url = item.find('link').first().text().trim() || item.find('link').first().attr('href') || sourceUrl;
      const normalizedTitle = this.normalizeText(title);

      // Skip pure how-to, game tips or error fixing articles (like "Cách...", "Lỗi...", "Hướng dẫn...")
      if (
        /^(cach|huong dan|loi |meo |top \d+ ung dung|tong hop code)/i.test(normalizedTitle) &&
        !normalizedTitle.includes('khuyen mai') &&
        !normalizedTitle.includes('sale') &&
        !normalizedTitle.includes('uu dai') &&
        !normalizedTitle.includes('ra mat')
      ) {
        continue;
      }

      const rawContent = item.find('content\\:encoded').text() || item.find('description').text() || '';
      const $c = cheerio.load(rawContent);
      let image = $c('img').first().attr('src') || item.find('enclosure').attr('url') || item.find('media\\:content').attr('url') || null;

      if (image && (this.isNoiseImage(image) || image.startsWith('data:'))) {
        image = null;
      }

      const absoluteUrl = this.resolveUrl(sourceUrl, url);
      const description = $c.text().replace(/\s+/g, ' ').trim();
      const pubDate = item.find('pubDate, published, updated').first().text().trim();

      if (title.length > 8 && absoluteUrl) {
        const published = this.parsePublishedDate(pubDate);
        if (published?.date && published.date < new Date('2025-01-01')) {
          continue;
        }
        items.push({
          title,
          description: description ? description.slice(0, 300) : null,
          image: image ? this.resolveUrl(sourceUrl, image) : null,
          url: absoluteUrl,
          eventDate: published?.date ?? null,
          eventTime: published?.time ?? null,
          score: 4,
          rawData: { kind: 'rss-feed', sourceUrl },
        });
      }
    }
    return items;
  }

  private extractNextJsPayload(html: string, sourceUrl: string): ParsedCrawlItem[] {
    if (!html.includes('self.__next_f') && !html.includes('__NEXT_DATA__') && !html.includes('/_next/')) {
      return [];
    }

    const items: ParsedCrawlItem[] = [];
    const seen = new Set<string>();

    const pushMatches = html.match(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g) || [];
    pushMatches.forEach((pm) => {
      const raw = pm.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const promoObjs = raw.match(/\{[^{}]*?"(?:alt|title)":\s*"([^"]+)"[^{}]*?\}/g) || [];

      promoObjs.forEach((objText) => {
        const altMatch = objText.match(/"(?:alt|title)":\s*"([^"]+)"/);
        const linkMatch = objText.match(/"(?:href|link|url)":\s*"([^"]+)"/);
        const imgMatch = objText.match(/"(?:src|desktop|mobile|image|banner)":\s*"([^"]+)"/);

        if (altMatch) {
          const title = altMatch[1].trim();
          const href = linkMatch ? linkMatch[1] : sourceUrl;
          const img = imgMatch ? imgMatch[1] : null;

          if (
            title.length > 5 &&
            !title.includes('logo') &&
            !title.includes('social') &&
            !title.includes('QR') &&
            !title.includes('DMCA') &&
            !title.includes('1800') &&
            !title.includes('Chính sách') &&
            !href.includes('/category/') &&
            !href.includes('wp-admin')
          ) {
            const url = href.startsWith('http') ? href : this.resolveUrl(sourceUrl, href);
            if (
              !seen.has(url) &&
              this.isLikelyEventUrl(url) &&
              !this.isNoiseTitle(title, url) &&
              !this.isGenericListingPage(title, url, '')
            ) {
              seen.add(url);
              items.push({
                title: this.cleanTitle(title),
                description: `Sự kiện ${title}`,
                image: img ? this.resolveUrl(sourceUrl, img) : null,
                url,
                score: 4,
                rawData: { kind: 'nextjs-payload', sourceUrl },
              });
            }
          }
        }
      });
    });

    const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\u0026/g, '&');
    let origin = '';
    try {
      origin = new URL(sourceUrl).origin;
    } catch {}

    if (origin) {
      const hrefRegex = /(?:https?:\/\/[^\/"'\s]+)?\/(?:tin-tuc|khuyen-mai|tin-khuyen-mai|tin-moi|news|events|sforum|danh-gia|dien-may)\/[a-z0-9]+-[a-z0-9-]+/gi;
      const hrefMatches = unescaped.match(hrefRegex) || [];

      hrefMatches.forEach((rawHref) => {
        if (
          rawHref.includes('/_next/') ||
          rawHref.includes('.js') ||
          rawHref.includes('.css') ||
          rawHref.includes('chunks') ||
          rawHref.includes('layout-') ||
          rawHref.includes('page-') ||
          rawHref.includes('/category/') ||
          rawHref.includes('wp-admin') ||
          rawHref.includes('wp-content') ||
          rawHref.includes('/tag/') ||
          rawHref.includes('/author/') ||
          rawHref.includes('/tac-gia/')
        ) {
          return;
        }

        const fullUrl = this.resolveUrl(sourceUrl, rawHref.split('?')[0]);
        const cleanUrl = fullUrl.replace(/\/$/, '');
        if (!seen.has(cleanUrl)) {
          seen.add(cleanUrl);

          const idx = unescaped.indexOf(rawHref);
          const snippet = unescaped.slice(Math.max(0, idx - 400), idx + 400);
          const titleMatch = snippet.match(/"(?:title|name|alt|label|heading)":\s*"([^"]{10,150})"/);
          const imgMatch =
            snippet.match(/"(?:src|image|avatar|thumbnail|desktop|mobile|banner)":\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/i) ||
            snippet.match(/"(?:src|image|avatar|thumbnail|desktop|mobile|banner)":\s*"([^"]+\.(?:jpg|jpeg|png|webp|avif)[^"]*)"/i) ||
            snippet.match(/https?:\/\/cdn2\.fptshop\.com\.vn\/[^"\s\\]+/i);

          const fallbackTitle = cleanUrl.split('/').pop()?.replace(/-/g, ' ') || '';
          const title = titleMatch ? titleMatch[1].replace(/\\u0026/g, '&') : fallbackTitle;
          const img = imgMatch ? (imgMatch[1] || imgMatch[0]) : null;

          if (
            title &&
            !this.isNoiseTitle(title, cleanUrl) &&
            this.isLikelyEventUrl(cleanUrl) &&
            !this.isGenericListingPage(title, cleanUrl, '')
          ) {
            items.push({
              title: this.cleanTitle(title.trim()),
              description: `Chương trình ${title}`,
              image: img ? this.resolveUrl(sourceUrl, img) : null,
              url: cleanUrl,
              eventDate: null,
              score: 4,
              rawData: { kind: 'nextjs-payload', sourceUrl },
            });
          }
        }
      });
    }

    return items;
  }

  private async extractFromEventBlocks($: cheerio.CheerioAPI, sourceUrl: string): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];
    const selectors = [
      'article',
      'section',
      '[class*="event"]',
      '[class*="promo"]',
      '[class*="sale"]',
      '[class*="livestream"]',
      '[class*="news"]',
      '[class*="post"]',
      '[class*="banner"]',
      '[class*="campaign"]',
      '[class*="product"]',
      '[class*="item"]',
      '[class*="card"]',
      '[class*="cps"]',
      '[class*="box"]',
    ];

    const blocks = $(selectors.join(',')).toArray();

    for (const el of blocks) {
      const block = $(el);
      const href = this.findBestHref($, block, sourceUrl);
      const title =
        block.find('h1, h2, h3, h4, h5, .title, .heading, a[title]').first().text().replace(/\s+/g, ' ').trim() ||
        block.attr('aria-label') ||
        block.find('a').first().text().replace(/\s+/g, ' ').trim();

      if (!href || title.length < 8 || this.isNoiseTitle(title, href)) continue;

      const description = block.find('p').first().text().replace(/\s+/g, ' ').trim() || null;
      const absoluteUrl = this.resolveUrl(sourceUrl, href);
      const image = await this.findBestImage($, block, sourceUrl);
      const published = this.parsePublishedDate(
        block.find('meta[property="article:published_time"]').attr('content') ||
          block.find('meta[name="pubdate"]').attr('content') ||
          block.find('time[datetime]').first().attr('datetime') ||
          block.find('time').first().text().trim() ||
          null,
      );
      const score = this.scoreText(`${title} ${description || ''}`) + (image ? 1 : 0);

      if (score < 3) continue;
      if (!this.isLikelyEventUrl(absoluteUrl)) continue;
      if (this.isNoiseTitle(title, absoluteUrl)) continue;
      if (this.isGenericListingPage(title, absoluteUrl, description || '')) continue;
      if (this.isNoiseLink(absoluteUrl, title, description || '')) continue;

      items.push({
        title,
        description,
        image,
        url: absoluteUrl,
        eventDate: published?.date ?? null,
        eventTime: published?.time ?? null,
        score,
        rawData: { kind: 'event-block', sourceUrl },
      });
    }

    return items;
  }

  private async extractFromLinks($: cheerio.CheerioAPI, sourceUrl: string): Promise<ParsedCrawlItem[]> {
    const items: ParsedCrawlItem[] = [];

    const links = $('a[href]').toArray();

    for (const el of links) {
      const link = $(el);
      const href = link.attr('href');
      const title = link.text().replace(/\s+/g, ' ').trim();
      if (!href || title.length < 8) continue;

      const context = link.closest('article, section, li, div, main');
      const contextText = context.text().replace(/\s+/g, ' ').trim();
      const absoluteUrl = this.resolveUrl(sourceUrl, href);
      const combined = this.normalizeText(`${title} ${contextText}`);
      const image = await this.findBestImage($, context.length ? context : link, sourceUrl);
      const score = this.scoreText(combined) + (image ? 1 : 0);
      const published = this.parsePublishedDate(
        context.find('meta[property="article:published_time"]').attr('content') ||
          context.find('meta[name="pubdate"]').attr('content') ||
          context.find('time[datetime]').first().attr('datetime') ||
          context.find('time').first().text().trim() ||
          null,
      );

      if (score < 3 && !/(khuyen mai|sale|uu dai|livestream|ra mat|su kien|quang cao|event|promotion|launch|deal|giam|tang|dat truoc|tra gop|dai tiec|hotsale|trinh lang|chot lich|chot ngay)/.test(combined)) continue;
      if (!this.isLikelyEventUrl(absoluteUrl)) continue;
      if (this.isNoiseTitle(title, absoluteUrl)) continue;
      if (this.isGenericListingPage(title, absoluteUrl, contextText || '')) continue;
      if (this.isNoiseLink(absoluteUrl, title, contextText)) continue;

      items.push({
        title,
        description: contextText || null,
        image,
        url: absoluteUrl,
        eventDate: published?.date ?? null,
        eventTime: published?.time ?? null,
        score,
        rawData: { kind: 'keyword-link', sourceUrl },
      });
    }

    return items;
  }

  private async findExistingEvent(target: CrawlTarget, item: ParsedCrawlItem) {
    const cleanUrl = this.normalizeUrl(item.url);
    const hash = this.buildContentHash(target.id, item.url, item.title);

    // 1. Check exact contentHash
    const byHash = await this.eventRepository.findOne({
      where: { sourceId: target.id, contentHash: hash },
    });
    if (byHash) return byHash;

    // 2. Check exact URL
    const byUrl = await this.eventRepository.findOne({
      where: { sourceId: target.id, url: item.url },
    });
    if (byUrl) return byUrl;

    // 3. Search in latest events for matching normalized URL or high title similarity
    const latest = await this.eventRepository.find({
      where: { sourceId: target.id },
      order: { createdAt: 'DESC' },
      take: 500,
    });

    const normTitle = this.normalizeText(item.title);
    return (
      latest.find((event) => {
        const evCleanUrl = this.normalizeUrl(event.url);
        if (evCleanUrl && cleanUrl && evCleanUrl === cleanUrl) return true;

        const evNormTitle = this.normalizeText(event.title);
        if (evNormTitle && normTitle && evNormTitle === normTitle) return true;

        return this.titleSimilarity(event.title, item.title) >= 0.70;
      }) || null
    );
  }

  private async extractDetailMetadata(url: string): Promise<{ title: string | null; image: string | null; date: Date | null; time: string | null }> {
    try {
      const resp = await this.fetchHtml(url);
      if (!resp || !resp.html) return { title: null, image: null, date: null, time: null };

      // If page redirected to a category hub or non-event URL, treat as invalid
      if (resp.url && !this.isLikelyEventUrl(resp.url)) {
        return { title: null, image: null, date: null, time: null };
      }

      const $ = cheerio.load(resp.html);

      const realTitle =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('h1').first().text().trim() ||
        null;

      if (realTitle && (this.isNoiseTitle(realTitle, resp.url || url) || this.isGenericListingPage(realTitle, resp.url || url, ''))) {
        return { title: null, image: null, date: null, time: null };
      }

      const ogImg =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[property="og:image:secure_url"]').attr('content') ||
        $('meta[name="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        $('meta[name="twitter:image:src"]').attr('content') ||
        this.extractJsonLdImage($) ||
        $('article img').first().attr('src') ||
        $('article img').first().attr('data-src') ||
        $('.post-content img').first().attr('src') ||
        $('.entry-content img').first().attr('src') ||
        null;

      let resolvedImg: string | null = null;
      if (ogImg && !ogImg.startsWith('data:') && !this.isNoiseImage(ogImg)) {
        resolvedImg = ogImg.startsWith('http') ? ogImg : this.resolveUrl(resp.url || url, ogImg);
      } else {
        const bannerImg = $('img')
          .filter((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || '';
            return src.startsWith('http') && !this.isNoiseImage(src) && !src.endsWith('.svg');
          })
          .first()
          .attr('src') || $('img')
          .filter((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || '';
            return src.startsWith('http') && !this.isNoiseImage(src) && !src.endsWith('.svg');
          })
          .first()
          .attr('data-src');
        if (bannerImg) {
          resolvedImg = this.resolveUrl(resp.url || url, bannerImg);
        }
      }

      // Strictly extract publication date (Ngày đăng bài)
      const jsonPublishedMatches = [
        ...resp.html.matchAll(/\\?"(?:datePublished|publishedAt|publishDate|articlePublishDate|dateCreated)\\?":\s*\\?"([^"\\]+)\\?"/gi),
      ].map((m) => m[1]);
      let detailDate: { date: Date; time: string } | null = null;

      const dateCandidates = [
        $('meta[property="article:published_time"]').attr('content'),
        $('meta[name="pubdate"]').attr('content'),
        $('meta[name="publish_date"]').attr('content'),
        $('meta[name="publishdate"]').attr('content'),
        ...jsonPublishedMatches,
        this.extractJsonLdDate($),
        $('time[datetime]').first().attr('datetime'),
        $('time').first().text().trim(),
        $('meta[property="og:updated_time"]').attr('content'),
        $('[itemprop="datePublished"]').attr('content') || $('[itemprop="datePublished"]').text().trim(),
        $('[itemprop="dateModified"]').attr('content') || $('[itemprop="dateModified"]').text().trim(),
        $('.timepost, .timer, .post-date, .entry-date, .date, .time, .author-date, .article-date, .author-time, .user-date').first().text().trim(),
      ].filter(Boolean) as string[];

      for (const candidate of dateCandidates) {
        detailDate = this.parsePublishedDate(candidate);
        if (detailDate) break;
      }

      if (!detailDate) {
        const textPubMatch = resp.html.match(/(?:ngày\s+đăng|xuất\s+bản|ngày\s+cập\s+nhật|đăng\s+lúc|cập\s+nhật\s+lúc)\s*:\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i);
        if (textPubMatch) {
          detailDate = this.parsePublishedDate(textPubMatch[1]);
        }
      }

      if (!detailDate && resp.url) {
        const urlMatch = resp.url.match(/[\/._-](202\d)[\/._-]?(0[1-9]|1[0-2])[\/._-]?([0-2][1-9]|3[01])[\/._-]/);
        if (urlMatch) {
          detailDate = {
            date: new Date(parseInt(urlMatch[1], 10), parseInt(urlMatch[2], 10) - 1, parseInt(urlMatch[3], 10), 9, 0),
            time: '09:00',
          };
        }
      }

      return {
        title: realTitle ? this.cleanTitle(realTitle) : null,
        image: resolvedImg,
        date: detailDate?.date ?? null,
        time: detailDate?.time ?? null,
      };
    } catch {
      return { title: null, image: null, date: null, time: null };
    }
  }

  private async enrichItemDetails(item: ParsedCrawlItem): Promise<void> {
    const isUnaccentedTitle = !/[\u00C0-\u024F\u1EA0-\u1EF9]/u.test(item.title) && item.title.includes(' ');
    const isMissingImage =
      !item.image ||
      item.image.startsWith('data:') ||
      this.isNoiseImage(item.image) ||
      item.image.includes('icon_') ||
      item.image.includes('/small/') ||
      item.image.includes('32x0');

    // Always fetch detail page to get accurate dates (RSS pubDate ≠ actual event date)
    const meta = await this.extractDetailMetadata(item.url);
    if (isUnaccentedTitle && meta.title && /[\u00C0-\u024F\u1EA0-\u1EF9]/u.test(meta.title)) {
      item.title = meta.title;
    }
    if (isMissingImage && meta.image && !this.isNoiseImage(meta.image)) {
      item.image = meta.image;
    }
    if (meta.date) {
      item.eventDate = meta.date;
      item.eventTime = meta.time || item.eventTime;
    }
  }

  private async createOrMergeEvent(target: CrawlTarget, item: ParsedCrawlItem, type: string) {
    if (!item.url || !this.isLikelyEventUrl(item.url) || this.isGenericListingPage(item.title, item.url, item.description || '')) {
      return null;
    }

    const now = new Date();
    const isMissingImage = !item.image || item.image.startsWith('data:') || this.isNoiseImage(item.image);
    const isSlugTitle = !item.title || !/[A-ZÀ-ỹ]/.test(item.title);

    // 1. ALWAYS fetch detail page to get accurate event dates and enrich missing images/titles
    // RSS/AJAX pubDate is the article publication date, NOT the actual event/sale date.
    // The real event date is usually in JSON-LD, meta tags, or article body on the detail page.
    if (item.url && item.url.startsWith('http')) {
      const detailMeta = await this.extractDetailMetadata(item.url);
      if (isSlugTitle && detailMeta.title) {
        item.title = detailMeta.title;
      }
      if (isMissingImage && detailMeta.image) {
        item.image = detailMeta.image;
      }
      if (detailMeta.date) {
        item.eventDate = detailMeta.date;
        item.eventTime = detailMeta.time || item.eventTime;
      }
    }

    // Discard unaccented slug titles (e.g. "Chuong trinh uu dai 300k...")
    const hasVietnamese = /[\u00C0-\u024F\u1EA0-\u1EF9]/u.test(item.title);
    const isUnaccentedVietnamese =
      !hasVietnamese &&
      item.title.length > 18 &&
      /uu dai|khuyen mai|giam gia|chuong trinh|tra gop|gia re|mua ngay|san sale|sieu sale|don tet|tuu truong|chao he|danh cho|khach hang|nguoi dung|ap dung|chinh hang|tang kem|tra truoc/i.test(
        item.title,
      );
    if (isUnaccentedVietnamese) {
      return null;
    }

    // Discard low-quality events that have no valid promotional banner image even after detail enrichment
    if (
      !item.image ||
      item.image.startsWith('data:') ||
      this.isNoiseImage(item.image) ||
      item.image.includes('/img/cellphones.png') ||
      item.image.includes('/img/hoangha.jpg') ||
      item.image.includes('placeholder')
    ) {
      return null;
    }

    // 2. Parse date before title cleaning (captures dates in raw title e.g. "Huy Nguyễn 23/07")
    const parsedDateInfo = this.parseItemEventDate(item, now);
    if (parsedDateInfo.date && parsedDateInfo.date < new Date('2025-01-01')) {
      return null;
    }
    item.title = this.cleanTitle(item.title);
    const contentHash = this.buildContentHash(target.id, item.url, item.title);

    const payload = this.eventRepository.create({
      sourceId: target.id,
      sourceName: target.name,
      origin: 'crawler',
      sourceUrl: (item.rawData?.sourceUrl as string) || item.url,
      title: item.title,
      description: item.description ?? null,
      image: item.image ?? null,
      url: item.url,
      eventDate: parsedDateInfo.date,
      eventTime: parsedDateInfo.time,
      type,
      rawData: item.rawData ?? null,
      contentHash,
      firstSeenAt: now,
      lastSeenAt: now,
      notifiedAt: null,
    });

    try {
      return await this.eventRepository.save(payload);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const existing = await this.eventRepository.findOne({
          where: [
            { sourceId: target.id, url: item.url },
            { sourceId: target.id, contentHash: payload.contentHash },
          ],
        });

        if (existing) {
          existing.lastSeenAt = now;
          existing.title = item.title;
          existing.description = item.description ?? existing.description;
          if (item.image && !item.image.startsWith('data:')) {
            existing.image = item.image;
          }
          if (parsedDateInfo?.date && !isNaN(parsedDateInfo.date.getTime())) {
            existing.eventDate = parsedDateInfo.date;
            existing.eventTime = parsedDateInfo.time || existing.eventTime;
          }
          existing.eventTime = existing.eventTime || parsedDateInfo.time;
          existing.rawData = item.rawData ?? existing.rawData;
          existing.type = type;
          return this.eventRepository.save(existing);
        }

        return null;
      }

      throw error;
    }
  }

  private findBestHref($: cheerio.CheerioAPI, block: cheerio.Cheerio<AnyNode>, sourceUrl: string) {
    const hrefs = block
      .find('a[href]')
      .map((_, a) => $(a).attr('href'))
      .get()
      .filter(Boolean) as string[];
    const fallback = block.closest('a[href]').attr('href') || hrefs[0] || null;
    return hrefs.find((href) => this.isLikelyEventUrl(this.resolveUrl(sourceUrl, href))) || fallback;
  }

  private findBestImage($: cheerio.CheerioAPI, block: cheerio.Cheerio<AnyNode>, sourceUrl: string) {
    const candidates: Array<string | undefined> = [];

    block.find('img').each((_, img) => {
      const image = $(img);
      const parent = image.closest('picture, figure, a, div');
      candidates.push(
        parent.find('source[type*="image"]').attr('srcset'),
        parent.find('source').attr('srcset'),
        image.attr('data-srcset'),
        image.attr('data-lazy-srcset'),
        image.attr('data-original-set'),
        image.attr('srcset'),
        image.attr('data-thumb'),
        image.attr('data-thumbnail'),
        image.attr('data-src'),
        image.attr('data-lazy-src'),
        image.attr('data-original'),
        image.attr('data-url'),
        image.attr('data-img'),
        image.attr('data-image'),
        image.attr('data-bg'),
        image.attr('data-background'),
        image.attr('data-background-image'),
        image.attr('data-original'),
        image.attr('src'),
      );
    });

    block.find('[style]').each((_, el) => {
      candidates.push(this.extractBackgroundImage($(el).attr('style')));
    });

    return (
      candidates
        .filter(Boolean)
        .flatMap((candidate) => this.expandImageCandidates(candidate as string))
        .map((candidate) => this.resolveUrl(sourceUrl, candidate))
        .find((candidate) => !this.isNoiseImage(candidate) && !this.isVideoUrl(candidate)) || null
    );
  }

  private isGenericListingPage(title: string, sourceUrl: string, description: string) {
    const normTitle = this.normalizeText(title);
    const normUrl = this.normalizeText(sourceUrl);

    // Exact listing titles
    const exactListingTitles = [
      'tin tuc',
      'tin khuyen mai',
      'tin tuc khuyen mai',
      'danh sach khuyen mai',
      'tin tuc cong nghe',
      'tin moi',
      'khuyen mai soc',
      'su kien',
      'chuyen muc',
      'trang chu',
      'home',
    ];
    if (exactListingTitles.includes(normTitle)) return true;

    // Known site banner / header / portal titles
    if (
      normTitle.includes('mang xa hoi cong nghe cap nhat 24h') ||
      normTitle.includes('tin tuc f studio') ||
      normTitle.includes('tin tuc fstudio') ||
      normTitle.includes('tin tuc dien may') ||
      normTitle.includes('tong hop tin tuc') ||
      normTitle.includes('danh muc tin tuc')
    ) {
      return true;
    }

    // URL is category hub
    if (
      normUrl.endsWith('/tin tuc') ||
      normUrl.endsWith('/tin khuyen mai') ||
      normUrl.endsWith('/khuyen mai soc') ||
      normUrl.endsWith('/danh sach khuyen mai') ||
      normUrl.endsWith('/tin fstudio') ||
      normUrl.endsWith('/dien may')
    ) {
      return true;
    }

    // If it mentions specific models or products, it is an actual promo article, not a category hub
    const isProductPromo = /(iphone|galaxy|oppo|xiaomi|macbook|laptop|ipad|redmi|vivo|realme|asus|lenovo|dell|hp|acer|tivi|tu lanh|may giat)/.test(normTitle);
    if (isProductPromo) return false;

    const combined = this.normalizeText(`${title} ${description} ${sourceUrl}`);
    return (
      /danh sach|category|tin tuc|news|khuyen mai|uu dai|su kien|event|promotion/.test(combined) &&
      !/(ra mat|mo ban|livestream|launch|sale|campaign)/.test(normTitle) &&
      normTitle.length < 60 &&
      /^(tin tuc|tin khuyen mai|danh sach|chuyen muc|tong hop)/.test(normTitle)
    );
  }

  private expandImageCandidates(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('data:')) return [];

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean)
        .reverse();
    }

    return [trimmed.split(/\s+/)[0]].filter(Boolean);
  }

  private extractBackgroundImage(style?: string) {
    if (!style) return undefined;
    return style.match(/background(?:-image)?:\s*url\((['"]?)(.*?)\1\)/i)?.[2];
  }

  private extractJsonLdImage($: cheerio.CheerioAPI) {
    let image: string | null = null;

    $('script[type="application/ld+json"]').each((_, script) => {
      if (image) return;

      try {
        const json = JSON.parse($(script).text());
        image = this.findImageInJsonLd(json);
      } catch {
        // Ignore invalid JSON-LD blocks from third-party scripts.
      }
    });

    return image;
  }

  private findImageInJsonLd(value: unknown): string | null {
    if (!value) return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const image = this.findImageInJsonLd(item);
        if (image) return image;
      }
      return null;
    }

    if (typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const candidate = record.image || record.thumbnailUrl;

    if (typeof candidate === 'string') return candidate;
    if (Array.isArray(candidate)) {
      const first = candidate.find((item) => typeof item === 'string');
      if (typeof first === 'string') return first;
    }
    if (candidate && typeof candidate === 'object') {
      const url = (candidate as Record<string, unknown>).url;
      if (typeof url === 'string') return url;
    }

    for (const child of Object.values(record)) {
      const image = this.findImageInJsonLd(child);
      if (image) return image;
    }

    return null;
  }

  private extractJsonLdDate($: cheerio.CheerioAPI): string | null {
    let dateStr: string | null = null;

    $('script[type="application/ld+json"]').each((_, script) => {
      if (dateStr) return;

      try {
        const json = JSON.parse($(script).text());
        dateStr = this.findDateInJsonLd(json);
      } catch {}
    });

    return dateStr;
  }

  private findDateInJsonLd(value: unknown): string | null {
    if (!value) return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findDateInJsonLd(item);
        if (found) return found;
      }
      return null;
    }

    if (typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const candidate = record.datePublished || record.dateCreated || record.uploadDate || record.dateModified;

    if (typeof candidate === 'string') return candidate;

    for (const child of Object.values(record)) {
      const found = this.findDateInJsonLd(child);
      if (found) return found;
    }

    return null;
  }

  private async dedupeAndRankItems(items: ParsedCrawlItem[], target?: CrawlTarget) {
    const map = new Map<string, ParsedCrawlItem>();

    const targetDomains = (target?.targetUrls || [])
      .map((u) => {
        try {
          return new URL(u).hostname.replace('www.', '');
        } catch {
          return '';
        }
      })
      .filter(Boolean);

    if (target?.id === 'cellphones' || targetDomains.some((dom) => dom.includes('cellphones') || dom.includes('sforum'))) {
      targetDomains.push('cellphones.com.vn', 'sforum.vn');
    }
    if (target?.id === 'fptshop' || targetDomains.some((dom) => dom.includes('fptshop') || dom.includes('fstudio'))) {
      targetDomains.push('fptshop.com.vn', 'fstudiobyfpt.com.vn');
    }

    for (const item of items) {
      if (item.title) item.title = this.cleanTitle(item.title);
      if (!item.title || !item.url) continue;
      if (this.isNoiseTitle(item.title, item.url)) continue;
      if (!this.isLikelyEventUrl(item.url)) continue;
      if (this.isGenericListingPage(item.title, item.url, item.description || '')) continue;

      if (targetDomains.length > 0) {
        try {
          const itemHost = new URL(item.url).hostname.replace('www.', '');
          const isMatch = targetDomains.some((dom) => itemHost.includes(dom) || dom.includes(itemHost));
          if (!isMatch) continue;
        } catch {
          continue;
        }
      }

      // Filter out footer noise links
      const titleLower = item.title.toLowerCase();
      if (
        titleLower.includes('thông báo bộ công thương') ||
        titleLower.includes('cần thuê mặt bằng') ||
        titleLower.includes('tổng đài hỗ trợ') ||
        titleLower.includes('tra cứu thông tin') ||
        titleLower.includes('chính sách bảo hành') ||
        titleLower.includes('chính sách đổi trả') ||
        titleLower.includes('dịch vụ chuyển phát') ||
        (item.image && item.image.includes('footer-icon'))
      ) {
        continue;
      }

      const cleanUrl = this.normalizeUrl(item.url);
      const key = cleanUrl;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, { ...item });
      } else {
        if ((!existing.image || existing.image.startsWith('data:') || this.isNoiseImage(existing.image)) && item.image && !item.image.startsWith('data:') && !this.isNoiseImage(item.image)) {
          existing.image = item.image;
        }
        if (
          /[\u00C0-\u024F\u1EA0-\u1EF9]/u.test(item.title) &&
          !/[\u00C0-\u024F\u1EA0-\u1EF9]/u.test(existing.title)
        ) {
          existing.title = item.title;
        } else if (item.title.length > existing.title.length && item.title.length < 150) {
          existing.title = item.title;
        }
        if ((item.score || 0) > (existing.score || 0)) {
          existing.score = item.score;
        }
      }
    }

    const list = Array.from(map.values());

    // Auto enrich ALL items: always fetch detail page for accurate event dates
    // (RSS/AJAX pubDate is the article publication date, NOT the actual event/sale date)
    const itemsToEnrich = list.slice(0, 250);

    const batchSize = target?.id === 'cellphones' ? 3 : 8;
    const batchDelay = target?.id === 'cellphones' ? 250 : 50;
    for (let i = 0; i < itemsToEnrich.length; i += batchSize) {
      const batch = itemsToEnrich.slice(i, i + batchSize);
      await Promise.all(batch.map((item) => this.enrichItemDetails(item)));
      if (batchDelay > 0) {
        await new Promise((r) => setTimeout(r, batchDelay));
      }
    }

    return list
      .sort((a, b) => {
        const imgA = a.image && !a.image.startsWith('data:') ? 1 : 0;
        const imgB = b.image && !b.image.startsWith('data:') ? 1 : 0;
        if (imgB !== imgA) return imgB - imgA;
        return (b.score || 0) - (a.score || 0);
      })
      .slice(0, 300);
  }

  private titleSimilarity(a: string, b: string) {
    const left = new Set(this.normalizeText(a).split(' ').filter(Boolean));
    const right = new Set(this.normalizeText(b).split(' ').filter(Boolean));
    if (!left.size || !right.size) return 0;

    const intersection = [...left].filter((word) => right.has(word)).length;
    return intersection / Math.max(left.size, right.size);
  }

  private scoreText(text: string) {
    const value = this.normalizeText(text);
    let score = 0;
    const weights: Array<[string, number]> = [
      ['ra mat', 4],
      ['mo ban', 4],
      ['khuyen mai', 4],
      ['uu dai', 3],
      ['sale', 3],
      ['livestream', 4],
      ['quang cao', 2],
      ['campaign', 2],
      ['event', 3],
      ['launch', 3],
      ['promotion', 3],
      ['flash sale', 4],
      ['pre order', 3],
      ['dang ky', 2],
      ['giam gia', 4],
      ['giam soc', 4],
      ['giam sau', 4],
      ['giam den', 4],
      ['deal', 3],
      ['hot deal', 4],
      ['hotsale', 4],
      ['hot sale', 4],
      ['dong gia', 4],
      ['qua tang', 3],
      ['tang ngay', 3],
      ['tang kem', 3],
      ['dat truoc', 4],
      ['tra gop', 3],
      ['thu cu', 3],
      ['doi moi', 3],
      ['voucher', 3],
      ['dai tiec', 4],
      ['le hoi', 4],
      ['tuan le', 3],
      ['vong quay', 3],
      ['trinh lang', 4],
      ['chot lich', 4],
      ['chot ngay', 4],
      ['cong bo', 3],
      ['su kien', 3],
      ['back to school', 4],
    ];

    for (const [keyword, weight] of weights) {
      if (value.includes(keyword)) score += weight;
    }

    return score;
  }

  private normalizeText(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9:/.\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private resolveUrl(baseUrl: string, targetUrl: string) {
    if (!targetUrl) return '';
    let resolved = targetUrl.trim();

    // Unwrap Next.js image proxy URLs: /_next/image?url=https%3A%2F%2Fcdn2...&w=3840&q=75
    if (resolved.includes('_next/image?url=')) {
      try {
        const urlParam = new URL(resolved.startsWith('http') ? resolved : `https://dummy.com${resolved}`).searchParams.get('url');
        if (urlParam) resolved = decodeURIComponent(urlParam);
      } catch {}
    }

    try {
      return new URL(resolved, baseUrl).toString();
    } catch {
      return resolved;
    }
  }

  private cleanTitle(rawTitle: string): string {
    if (!rawTitle) return '';
    let title = rawTitle.replace(/\s+/g, ' ').trim();

    // 0. Decode HTML numeric & named entities (e.g. &#234; -> ê, &#39; -> ', &quot; -> ")
    title = title
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'");

    // 1. Match author (with Vietnamese letters) + Date (DD/MM) or Relative Time at end (e.g. "Huy Nguyễn 23/07")
    title = title.replace(/\s+[\p{L}\s.]{2,30}\s+(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\d+\s*(?:giờ|ngày|phút|tuần)\s*(?:trước|sau))$/iu, '');

    // 2. Standalone date or relative time at end: e.g. " 13 giờ trước", " 23/07"
    title = title.replace(/\s+(?:\d+\s*(?:giờ|ngày|phút|tuần)\s*(?:trước|sau)|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)$/iu, '');

    // 3. Remove generic brand site suffixes (e.g. " - Domain.com", " | BrandName")
    title = title.replace(/\s*[-|]\s*[A-Za-z0-9.-]+(?:\.com|\.vn|\.com\.vn)?\s*$/i, '');

    return title.trim();
  }

  private parsePublishedDate(text: string | null | undefined, referenceDate: Date = new Date()): { date: Date; time: string } | null {
    if (!text) return null;
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // 0. Direct ISO / standard date parsing (e.g. "2026-08-08T09:00:00Z", "Fri, 08 Aug 2026", "2025-10-03", "8/30/2026 2:50:27 PM")
    if (
      cleanText.length >= 10 &&
      (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(cleanText) ||
        /^\d{1,2}\/\d{1,2}\/\d{4}/.test(cleanText) ||
        /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i.test(cleanText) ||
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(cleanText))
    ) {
      const direct = new Date(cleanText);
      if (!Number.isNaN(direct.getTime()) && direct.getFullYear() >= 2020 && direct.getFullYear() <= 2035) {
        const timeStr = `${String(direct.getHours()).padStart(2, '0')}:${String(direct.getMinutes()).padStart(2, '0')}`;
        return { date: direct, time: timeStr };
      }
    }

    // 0.4. Check WordPress translated month format (e.g. "Tháng 10 28, 2025" or "Tháng 3 15, 2026")
    const wpMonthMatch = cleanText.match(/tháng\s*([1-9]|1[0-2])\s*(?:ngày\s*)?(\d{1,2}),?\s+(\d{4})/i);
    if (wpMonthMatch) {
      const [, monthStr, dayStr, yearStr] = wpMonthMatch;
      const m = parseInt(monthStr, 10);
      const d = parseInt(dayStr, 10);
      const y = parseInt(yearStr, 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2035) {
        return { date: new Date(y, m - 1, d, 9, 0), time: '09:00' };
      }
    }

    // 0.45. Check "DD Tháng MM, YYYY" (e.g. "28 Tháng 10, 2025" or "5 Tháng 9 2026")
    const dayMonthYearMatch = cleanText.match(/(\d{1,2})\s+tháng\s*([1-9]|1[0-2]),?\s+(?:năm\s+)?(\d{4})/i);
    if (dayMonthYearMatch) {
      const [, dayStr, monthStr, yearStr] = dayMonthYearMatch;
      const d = parseInt(dayStr, 10);
      const m = parseInt(monthStr, 10);
      const y = parseInt(yearStr, 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2035) {
        return { date: new Date(y, m - 1, d, 9, 0), time: '09:00' };
      }
    }

    // 0.5. Check Vietnamese word month format (e.g. "Tháng mười một 11, 2025", "15 Tháng mười hai, 2025")
    const vnWordMonths = [
      { text: 'tháng mười hai', month: 12 },
      { text: 'tháng mười một', month: 11 },
      { text: 'tháng mười', month: 10 },
      { text: 'tháng chín', month: 9 },
      { text: 'tháng tám', month: 8 },
      { text: 'tháng bảy', month: 7 },
      { text: 'tháng sáu', month: 6 },
      { text: 'tháng năm', month: 5 },
      { text: 'tháng tư', month: 4 },
      { text: 'tháng bốn', month: 4 },
      { text: 'tháng ba', month: 3 },
      { text: 'tháng hai', month: 2 },
      { text: 'tháng một', month: 1 },
    ];
    const lowerClean = cleanText.toLowerCase();
    for (const m of vnWordMonths) {
      if (lowerClean.includes(m.text)) {
        const match = lowerClean.match(new RegExp(`${m.text}\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i')) ||
                      lowerClean.match(new RegExp(`(\\d{1,2})\\s+${m.text},?\\s+(\\d{4})`, 'i'));
        if (match) {
          const day = parseInt(match[1], 10);
          const year = parseInt(match[2], 10);
          if (day >= 1 && day <= 31 && year >= 2000 && year <= 2030) {
            return { date: new Date(year, m.month - 1, day, 9, 0), time: '09:00' };
          }
        }
      }
    }

    // 1. Check "ngày DD tháng MM (năm YYYY)"
    const vnTextDateMatch = cleanText.match(/(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/i);
    if (vnTextDateMatch) {
      const [, dayStr, monthStr, yearStr] = vnTextDateMatch;
      const day = parseInt(dayStr, 10);
      const month = parseInt(monthStr, 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const year = yearStr ? parseInt(yearStr, 10) : referenceDate.getFullYear();
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 2. Check YYYY-MM-DD or YYYY/MM/DD
    const isoDateMatch = cleanText.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (isoDateMatch) {
      const [, yearStr, monthStr, dayStr] = isoDateMatch;
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2030) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 3. Check DD/MM/YYYY or DD-MM-YYYY
    const fullDateMatch = cleanText.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
    if (fullDateMatch) {
      const [, dayStr, monthStr, yearStr] = fullDateMatch;
      const day = parseInt(dayStr, 10);
      const month = parseInt(monthStr, 10);
      const year = parseInt(yearStr, 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2030) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 4. Check DD/MM without year (e.g. "18/08", "03/08", "Vinh Mai 18/08")
    const shortDateMatch = cleanText.match(/(?:^|\s|[^\d/])([0-2]?[1-9]|3[01])\/(0?[1-9]|1[0-2])(?:\s|$|[^\d/])/);
    if (shortDateMatch) {
      const day = parseInt(shortDateMatch[1], 10);
      const month = parseInt(shortDateMatch[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        let year = referenceDate.getFullYear();
        if (month > referenceDate.getMonth() + 1 + 2) {
          year -= 1;
        }
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 5. Check relative time: "X giờ trước", "X ngày trước"
    const relMatch = cleanText.match(/(\d+)\s*(phút|giờ|ngày|tuần)\s*(trước|sau)/i);
    if (relMatch) {
      const [, countStr, unit, direction] = relMatch;
      const n = parseInt(countStr, 10);
      const d = new Date(referenceDate.getTime());
      if (direction.toLowerCase() === 'trước') {
        if (unit.toLowerCase().includes('phút')) d.setMinutes(d.getMinutes() - n);
        else if (unit.toLowerCase().includes('giờ')) d.setHours(d.getHours() - n);
        else if (unit.toLowerCase().includes('ngày')) d.setDate(d.getDate() - n);
        else if (unit.toLowerCase().includes('tuần')) d.setDate(d.getDate() - n * 7);
      }
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return { date: d, time: timeStr };
    }

    return null;
  }

  private extractExplicitEventDate(
    title: string,
    description = '',
    referenceDate: Date = new Date(),
  ): { date: Date; time: string } | null {
    if (!title) return null;
    const text = `${title} ${description || ''}`.replace(/\s+/g, ' ');

    // Check if title or text explicitly mentions a 4-digit year (e.g. 2027 in "CES 2027", 2023 in "ROG Ally (2023)")
    const explicitYearMatch = text.match(/\b(202[0-9]|203[0-9])\b/);
    const getYear = (matchedYear?: string) => {
      if (matchedYear) return parseInt(matchedYear, 10);
      if (explicitYearMatch) return parseInt(explicitYearMatch[1], 10);
      return referenceDate.getFullYear();
    };

    // 1. Prefix date at start of title: e.g. "07/01 Sự kiện CES 2027...", "6/8 Điện máy XANH lên sàn..."
    const prefixMatch = title.trim().match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?\s+/i);
    if (prefixMatch) {
      const day = parseInt(prefixMatch[1], 10);
      const month = parseInt(prefixMatch[2], 10);
      const year = getYear(prefixMatch[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 2. Range dates: e.g. "Flash sale 8-9/8", "15-16/8", "từ 15-20/08", "22 - 23/8"
    const rangeMatch = text.match(/(?:từ\s*)?(\d{1,2})\s*[-–]\s*(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?/i);
    if (rangeMatch) {
      const startDay = parseInt(rangeMatch[1], 10);
      const month = parseInt(rangeMatch[3], 10);
      const year = getYear(rangeMatch[4]);
      if (startDay >= 1 && startDay <= 31 && month >= 1 && month <= 12) {
        return { date: new Date(year, month - 1, startDay, 9, 0), time: '09:00' };
      }
    }

    // 3. "sự kiện (ngày )?DD/MM(/YYYY)" or "diễn ra (ngày )?DD/MM(/YYYY)" or "khai mạc (ngày )?DD/MM"
    const eventKeywordMatch = text.match(
      /(?:sự\s+kiện|diễn\s+ra|khai\s+mạc|tổ\s+chức)\s+(?:vào\s+)?(?:ngày\s+)?(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?/i,
    );
    if (eventKeywordMatch) {
      const day = parseInt(eventKeywordMatch[1], 10);
      const month = parseInt(eventKeywordMatch[2], 10);
      const year = getYear(eventKeywordMatch[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 4. "ngày DD tháng MM (năm YYYY)"
    const vnTextDateMatch = text.match(
      /(?:sự\s+kiện|diễn\s+ra|ngày|bắt\s+đầu)\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/i,
    );
    if (vnTextDateMatch) {
      const day = parseInt(vnTextDateMatch[1], 10);
      const month = parseInt(vnTextDateMatch[2], 10);
      const year = getYear(vnTextDateMatch[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 5. Commercial sale campaigns: "Sale 2/9", "Sale 6/8", "Hotsale 8/3", "Hotsale ngày 18/3", "Siêu Sale 6/8", "Bão sale Samsung 12/12"
    const saleMatch = text.match(
      /(?:sale|hotsale|siêu\s+sale|flash\s+sale|bão\s+sale)\s+(?:ngày\s+)?(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?/i,
    );
    if (saleMatch) {
      const day = parseInt(saleMatch[1], 10);
      const month = parseInt(saleMatch[2], 10);
      const year = getYear(saleMatch[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 6. "từ ngày DD/MM" or "áp dụng từ DD/MM" or "từ DD/MM"
    const fromDateMatch = text.match(
      /(?:từ\s+(?:ngày\s+)?|áp\s+dụng\s+từ\s+)(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?/i,
    );
    if (fromDateMatch) {
      const day = parseInt(fromDateMatch[1], 10);
      const month = parseInt(fromDateMatch[2], 10);
      const year = getYear(fromDateMatch[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    return null;
  }

  private parseItemEventDate(item: ParsedCrawlItem, defaultRefDate: Date = new Date()): { date: Date; time: string } {
    const hasValidItemDate = item.eventDate && !isNaN(item.eventDate.getTime());
    const isDummyNow = hasValidItemDate && Math.abs(item.eventDate!.getTime() - defaultRefDate.getTime()) < 5000;
    const refDate = hasValidItemDate && !isDummyNow ? item.eventDate! : defaultRefDate;

    // 0. Explicit campaign / event date in title or description (e.g. "Sự kiện 9/9/2026", "Flash sale 8-9/8", "Sale 2/9")
    // Anchor to the article's actual published date (refDate) so past 2023/2024 articles retain their proper year
    // 1. Article publication date from crawler/metadata/detail page
    if (hasValidItemDate && !isDummyNow) {
      const timeStr = item.eventTime || `${String(item.eventDate!.getHours()).padStart(2, '0')}:${String(item.eventDate!.getMinutes()).padStart(2, '0')}`;
      return { date: item.eventDate!, time: timeStr };
    }

    const url = item.url || '';

    const explicit = this.extractExplicitEventDate(item.title, item.description || '', refDate);
    if (explicit) {
      return explicit;
    }

    // 2. Check if URL contains publication date (e.g. /2026/08/08/ or /2025-01-15/)
    const urlDateMatch = url.match(/[\/._-](202\d)[\/._-]?(0[1-9]|1[0-2])[\/._-]?([0-2][1-9]|3[01])[\/._-]/);
    if (urlDateMatch) {
      const [, y, m, day] = urlDateMatch;
      const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(day, 10), 9, 0);
      return { date: d, time: '09:00' };
    }

    // 3. Fallback: relative time in raw snippet (e.g. "3 giờ trước")
    const text = `${item.title} ${item.description || ''}`.trim();
    const relMatch = text.match(/(\d+)\s*(phút|giờ|ngày|tuần)\s*(trước|sau)/i);
    if (relMatch) {
      const [, countStr, unit, direction] = relMatch;
      const n = parseInt(countStr, 10);
      const d = new Date(refDate.getTime());
      if (direction.toLowerCase() === 'trước') {
        if (unit.toLowerCase().includes('phút')) d.setMinutes(d.getMinutes() - n);
        else if (unit.toLowerCase().includes('giờ')) d.setHours(d.getHours() - n);
        else if (unit.toLowerCase().includes('ngày')) d.setDate(d.getDate() - n);
        else if (unit.toLowerCase().includes('tuần')) d.setDate(d.getDate() - n * 7);
      }
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return { date: d, time: timeStr };
    }

    // 4. Default fallback: keep item.eventDate or refDate
    return {
      date: hasValidItemDate ? item.eventDate! : refDate,
      time: item.eventTime || '09:00',
    };
  }

  private isLikelyEventUrl(url: string) {
    if (!url) return false;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const pathname = parsed.pathname.toLowerCase().replace(/\/$/, '');
    const segments = pathname.split('/').filter(Boolean);

    // 1. Must have at least 1 path segment
    if (segments.length === 0) return false;

    // 2. Reject admin, auth, policies, support, internal portals
    if (
      pathname.includes('wp-admin') ||
      pathname.includes('wp-login') ||
      pathname.includes('wp-content') ||
      pathname.includes('/category/') ||
      pathname.includes('/tag/') ||
      pathname.includes('/author/') ||
      pathname.includes('/tac-gia/') ||
      pathname.includes('/chu-de/') ||
      pathname.includes('/chuyen-muc/') ||
      pathname.startsWith('/chinh-sach') ||
      pathname.startsWith('/quy-dinh') ||
      pathname.startsWith('/dieu-khoan') ||
      pathname.startsWith('/tos') ||
      pathname.startsWith('/privacy') ||
      pathname.startsWith('/ho-tro') ||
      pathname.startsWith('/lien-he') ||
      pathname.startsWith('/gioi-thieu') ||
      pathname.startsWith('/bao-hanh') ||
      pathname.endsWith('/bao-hanh') ||
      pathname.endsWith('/chinh-sach') ||
      pathname.includes('/kiem-tra-bao-hanh') ||
      pathname.includes('hddt.') ||
      pathname.includes('mobile.html')
    ) {
      return false;
    }

    // 3. Reject pagination & query references
    if (parsed.searchParams.has('ref') || pathname.includes('/page/') || pathname.includes('/trang-')) {
      return false;
    }

    // 4. Reject known listing hubs & category paths across all sites
    const categoryEndpoints = [
      '/tin-tuc',
      '/tin-khuyen-mai',
      '/khuyen-mai',
      '/sforum',
      '/sforum/khuyen-mai-soc',
      '/sforum/su-kien',
      '/sforum/thi-truong',
      '/sforum/tin-cong-nghe',
      '/sforum/danh-gia',
      '/tin-tuc/tin-khuyen-mai',
      '/tin-tuc/tin-moi',
      '/tin-tuc/danh-gia',
      '/tin-tuc/dien-may',
      '/tin-tuc/tin-fstudio',
      '/tin-tuc/hoi-dap',
      '/tin-tuc/thu-thuat',
      '/tin-tuc/video-hot',
      '/danh-sach-khuyen-mai',
      '/khuyen-mai-soc',
      '/e-magazine',
    ];
    if (categoryEndpoints.includes(pathname)) {
      return false;
    }

    // 5. Site-specific structural checks:
    // A. Thế Giới Di Động:
    if (host.includes('thegioididong.com')) {
      if (!pathname.startsWith('/tin-tuc/')) return false;
      if (segments.length < 2) return false;
      // Filter out TGDD sub-category hubs like /tin-tuc/tin-khuyen-mai/31 or /tin-tuc/danh-gia/210
      if (/^\/tin-tuc\/[a-z0-9-]+\/\d+$/.test(pathname)) return false;
      // Reject TGDD product catalog categories
      if (['den-thong-minh', 'dtdd', 'laptop', 'tablet', 'dong-ho', 'phu-kien'].includes(segments[0])) return false;
    }

    // B. FPT Shop:
    if (host.includes('fptshop.com.vn')) {
      if (pathname.startsWith('/tin-tuc')) {
        // FPT Shop articles: /tin-tuc/<category>/<slug>
        if (segments.length < 3) return false;
      }
      // Filter out FPT Shop product categories
      if (/\/(?:dien-may|giai-tri|thu-thuat|game-app|for-gamers|video-hot|hoi-dap|tac-gia|san-pham|chu-de)(?:\/|$)/.test(pathname)) return false;
      if (/\/(?:noi-lau-dien|may-ep-hoa-qua|binh-dun-nuoc|noi-com-dien|may-rua-bat|noi-chien-khong-dau|noi-ap-suat|chao-chong-dinh|phu-kien)\//.test(pathname)) return false;
    }

    // C. CellphoneS / Sforum:
    if (host.includes('cellphones.com.vn') || host.includes('sforum.vn')) {
      if (pathname === '/danh-sach-khuyen-mai' || pathname === '/sforum/khuyen-mai-soc' || pathname === '/sforum') {
        return false;
      }
      if (segments.length === 0) return false;
    }

    // D. Hoàng Hà Mobile:
    if (host.includes('hoanghamobile.com')) {
      if (pathname === '/tin-tuc' || pathname === '/tin-tuc/khuyen-mai') return false;
      if (!pathname.startsWith('/tin-tuc/')) return false;
    }

    const value = this.normalizeText(url);
    return /khuyen-mai|uu-dai|sale|livestream|ra-mat|mo-ban|su-kien|promotion|event|launch|campaign|flash-sale|giam-gia|hot-deal|voucher|thanh-toan|smember|sforum|tin-tuc|deal|giam|tang|quoc-khanh|flagship|chuong-trinh|mo-rong|tra-gop/.test(value);
  }

  private isNoiseTitle(title: string, url: string): boolean {
    if (!title || title.trim().length < 8) return true;

    const lower = title.trim().toLowerCase();
    const normalized = this.normalizeText(title);

    // 1. Rejection of code snippets, HTML tags, attributes, and URLs as titles
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.includes('data-element_type=') ||
      lower.includes('speculationrules') ||
      lower.includes('wp-content') ||
      lower.includes('wp-includes') ||
      lower.includes('wp content') ||
      lower.includes('wp includes') ||
      lower.includes('application/rss+xml') ||
      lower.includes('<nav') ||
      lower.includes('<div') ||
      lower.includes('<script') ||
      lower.includes('class=') ||
      lower.includes('href=') ||
      lower.includes('style=') ||
      lower === 'description' ||
      lower === 'tin tức' ||
      lower === 'tin tuc'
    ) {
      return true;
    }

    // 2. Rejection of pure category labels or nav items without actual event title
    if (
      normalized === 'chua duoc phan loai' ||
      normalized === 'uncategorized' ||
      normalized === 'trang chu' ||
      normalized === 'tin tuc cong nghe' ||
      normalized === 'danh gia' ||
      normalized === 'khuyen mai' ||
      normalized === 'tin tuc' ||
      normalized === 'laptop pc' ||
      normalized === 'laptop & pc' ||
      normalized.includes('dmca logo') ||
      normalized.includes('logo sforum') ||
      normalized.includes('chinh sach bao mat') ||
      normalized.includes('thoa thuan cung cap') ||
      normalized.includes('cau hoi thuong gap') ||
      normalized.includes('huong dan mua hang') ||
      normalized.includes('quy dinh ve ho tro') ||
      normalized.includes('dai ly uy quyen') ||
      normalized.includes('cac dieu kien') ||
      normalized.includes('quy trinh giai quyet') ||
      normalized.includes('tin tuc dien may') ||
      normalized.includes('goc giai tri') ||
      normalized.includes('tin tuc f studio') ||
      normalized.includes('tin tuc fstudio') ||
      normalized.includes('video danh gia') ||
      normalized.includes('chuyen trang game') ||
      normalized.includes('kien thuc doi song') ||
      normalized.includes('thu thuat') ||
      normalized.includes('gioi thieu ve cong ty') ||
      normalized.includes('gioi thieu may doi tra') ||
      normalized.includes('tra cuu hoa don') ||
      normalized.includes('du an doanh nghiep') ||
      normalized.includes('quy che hoat dong') ||
      normalized.includes('thuong hieu dam bao') ||
      normalized.includes('tra cuu bao hanh') ||
      normalized.includes('tra cuu bang gia') ||
      normalized.includes('danh sach nguoi co anh huong') ||
      normalized === 'khong tim thay' ||
      normalized.startsWith('luu tru') ||
      normalized === 'gioi thieu' ||
      normalized === 'home' ||
      normalized === 'menu'
    ) {
      return true;
    }

    return false;
  }

  private isNoiseLink(url: string, title: string, contextText: string) {
    const combined = this.normalizeText(`${url} ${title} ${contextText}`);
    return (
      combined.startsWith('tel:') ||
      /\b1[89]00[\s.-]?\d{4}\b/.test(combined) ||
      combined.includes('chinh sach bao mat') ||
      combined.includes('dang ky nhan tin') ||
      combined.includes('xem tat ca') ||
      combined.includes('dieu khoan') ||
      combined.includes('gioi thieu ve cong ty') ||
      combined.includes('gioi thieu cong ty') ||
      combined.includes('gioi thieu may doi tra') ||
      combined.includes('quy che') ||
      combined.includes('cau hoi thuong gap') ||
      combined.includes('tra cuu') ||
      combined.includes('quy trinh') ||
      combined.includes('cac dieu kien') ||
      combined.includes('du an doanh nghiep') ||
      combined.includes('huong dan mua hang') ||
      combined.includes('dai ly uy quyen') ||
      combined.includes('nguoi co anh huong') ||
      combined.includes('quy dinh ve') ||
      combined.includes('/ho-tro/') ||
      combined.includes('/kiem-tra-bao-hanh') ||
      combined.includes('hddt.') ||
      combined.includes('thuong hieu dam bao') ||
      (combined.includes('mobile.html') && !combined.includes('khuyen mai') && !combined.includes('uu dai'))
    );
  }

  private isNoiseImage(url: string) {
    const value = this.normalizeText(url);
    return (
      value.includes('chibi') ||
      value.includes('mascot') ||
      value.includes('sticker') ||
      value.includes('favicon') ||
      (value.includes('logo') && !value.includes('banner')) ||
      value.includes('sprite') ||
      value.includes('placeholder') ||
      value.includes('blank') ||
      value.includes('default') ||
      value.includes('avatar') ||
      value.includes('icon') ||
      value.includes('video')
    );
  }

  private isVideoUrl(url: string) {
    const value = this.normalizeText(url);
    return (
      value.includes('.mp4') ||
      value.includes('.webm') ||
      value.includes('.mov') ||
      value.includes('.m3u8') ||
      value.includes('video') ||
      value.includes('facebook.com/watch') ||
      value.includes('youtu.be') ||
      value.includes('youtube.com/watch')
    );
  }



  private normalizeUrl(rawUrl?: string | null): string {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'spm', 'ref'];
      trackingParams.forEach((param) => parsed.searchParams.delete(param));

      let clean = `${parsed.origin}${parsed.pathname}`;
      if (clean.endsWith('/') && clean.length > 8) {
        clean = clean.slice(0, -1);
      }
      if (parsed.search) {
        clean += parsed.search;
      }
      return clean.toLowerCase();
    } catch {
      return (rawUrl || '').trim().toLowerCase().replace(/\/$/, '');
    }
  }

  private buildContentHash(sourceId: string, url: string, title: string) {
    const cleanUrl = this.normalizeUrl(url);
    const cleanTitle = this.normalizeText(title);
    return createHash('sha256').update(`${sourceId}|${cleanUrl}|${cleanTitle}`).digest('hex');
  }

  private isDuplicateKeyError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  private async notifyNewCrawlerEvent(event: Event) {
    const message = this.formatTelegramMessage(event);

    if (event.image) {
      return this.telegramService.sendPhoto(event.image, message);
    }

    return this.telegramService.sendMessage(message);
  }

  private formatTelegramMessage(event: Event) {
    const formattedDate = event.eventDate
      ? new Date(event.eventDate).toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';

    const lines = [
      '<b>🔔 SỰ KIỆN ĐỐI THỦ MỚI</b>',
      `<b>Thương hiệu:</b> ${this.escapeHtml(event.sourceName)}`,
      `<b>Tiêu đề:</b> ${this.escapeHtml(event.title)}`,
      `<b>Loại sự kiện:</b> ${this.escapeHtml(this.getEventTypeLabel(event.type))}`,
      formattedDate ? `<b>Thời gian:</b> ${formattedDate}` : '',
      `<b>Chi tiết:</b> ${this.escapeHtml(event.url)}`,
    ];

    return lines.filter(Boolean).join('\n');
  }

  private getEventTypeLabel(type: string) {
    const labels: Record<string, string> = {
      release: 'Ra mắt / Mở bán',
      promo: 'Khuyến mãi',
      sale: 'Khuyến mãi',
      live: 'Livestream',
      livestream: 'Livestream',
      ads: 'Quảng cáo',
      internal: 'Sự kiện nội bộ',
      other: 'Khác',
    };

    return labels[type] || type;
  }

  private escapeHtml(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
