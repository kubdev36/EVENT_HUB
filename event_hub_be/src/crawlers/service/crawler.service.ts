import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassifierService } from '../../classifier/classifier.service.js';
import { Event } from '../../events/entity/event.entity.js';
import { Setting } from '../../settings/entity/setting.entity.js';
import { TelegramService } from '../../telegram/telegram.service.js';
import { CrawlSource, CrawlTarget, KeywordRule, ParsedCrawlItem } from '../crawler.types.js';
import { CrawlerRun } from '../entity/crawler-run.entity.js';
import { CrawlerHttpClient } from '../engine/crawler-http.client.js';
import { GenericRssEngine } from '../engine/generic-rss.engine.js';
import { GenericApiEngine } from '../engine/generic-api.engine.js';
import { GenericHtmlEngine } from '../engine/generic-html.engine.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';
import { UrlNormalizerHelper } from '../helpers/url-normalizer.helper.js';

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
    private readonly rssEngine: GenericRssEngine,
    private readonly apiEngine: GenericApiEngine,
    private readonly htmlEngine: GenericHtmlEngine,
  ) {}

  async crawlAllTargets() {
    const targets = (await this.getCrawlerTargets()).filter((target) => target.enabled !== false);
    const results = [];
    for (const target of targets) {
      const res = await this.crawlTargetSafely(target);
      results.push(res);
      // Gentle delay between targets (2-3s) to prevent IP rate-limiting & WAF flags
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 1000));
    }
    return results;
  }

  async getRecentRuns(limit = 50) {
    return this.crawlerRunRepository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async crawlAllSources() {
    return this.crawlAllTargets();
  }

  async crawlSource(source: CrawlSource) {
    return this.crawlTarget(source);
  }

  async crawlSourceById(id: string) {
    return this.crawlTargetById(id);
  }

  async crawlTargetById(id: string) {
    const target = await this.getCrawlerTargetById(id);
    return this.crawlTarget(target);
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
      const rawItems = await this.fetchItemsFromTarget(target);
      const rules = await this.getKeywordRules();
      const seen = new Set<string>();
      let newItemsCount = 0;

      // Filter and deduplicate within current run
      const validItems: ParsedCrawlItem[] = [];
      for (const item of rawItems) {
        const cleanUrl = UrlNormalizerHelper.normalizeUrl(item.url);
        if (!cleanUrl || seen.has(cleanUrl) || NoiseFilterHelper.isNoiseTitle(item.title)) continue;
        seen.add(cleanUrl);
        validItems.push(item);
      }

      for (const item of validItems) {
        const type = this.classifierService.classify(item.title, item.description || '', rules);
        if (!type) continue;

        const dateInfo = DateExtractorHelper.parseItemEventDate(item);
        if (dateInfo.date && dateInfo.date < new Date('2025-01-01')) continue;

        const contentHash = UrlNormalizerHelper.buildContentHash(target.id, item.url, item.title);
        const existing = await this.eventRepository.findOne({
          where: [{ sourceId: target.id, url: item.url }, { sourceId: target.id, contentHash }],
        });

        if (existing) {
          existing.lastSeenAt = new Date();
          existing.title = item.title;
          existing.description = item.description ?? existing.description;
          if (item.image && !NoiseFilterHelper.isNoiseImage(item.image)) {
            existing.image = item.image;
          }
          if (dateInfo.date && !isNaN(dateInfo.date.getTime())) {
            existing.eventDate = dateInfo.date;
            existing.eventTime = dateInfo.time || existing.eventTime;
          }
          existing.type = type;
          await this.eventRepository.save(existing);
          continue;
        }

        // Create new Event
        const newEvent = this.eventRepository.create({
          sourceId: target.id,
          sourceName: target.name,
          origin: 'crawler',
          sourceUrl: (item.rawData?.sourceUrl as string) || item.url,
          title: item.title,
          description: item.description ?? null,
          image: item.image && !NoiseFilterHelper.isNoiseImage(item.image) ? item.image : null,
          url: item.url,
          eventDate: dateInfo.date,
          eventTime: dateInfo.time,
          type,
          rawData: item.rawData ?? null,
          contentHash,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          notifiedAt: null,
        });

        const savedEvent = await this.eventRepository.save(newEvent);
        newItemsCount += 1;
        await this.notifyTelegram(savedEvent);
      }

      run.status = 'success';
      run.itemsFound = validItems.length;
      run.newItems = newItemsCount;
      run.finishedAt = new Date();
      await this.crawlerRunRepository.save(run);

      return {
        sourceId: target.id,
        sourceName: target.name,
        type: target.type || 'web',
        itemsFound: validItems.length,
        newItems: newItemsCount,
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

  private async fetchItemsFromTarget(target: CrawlTarget): Promise<ParsedCrawlItem[]> {
    const allItems: ParsedCrawlItem[] = [];

    // 1. Fetch from Generic API / GraphQL Engine if applicable
    const apiItems = await this.apiEngine.fetchApiItems(target);
    allItems.push(...apiItems);

    // 2. Fetch all configured target URLs
    for (const url of target.targetUrls || []) {
      const isRssOrXml = url.includes('.rss') || url.includes('.xml') || url.includes('/feed');
      if (isRssOrXml) {
        // Generic RSS / Google News Sitemap Engine
        const rssItems = await this.rssEngine.fetchRssOrSitemap(url);
        allItems.push(...rssItems);
      } else {
        // Generic HTML Engine
        const htmlItems = await this.htmlEngine.fetchHtmlItems(url);
        allItems.push(...htmlItems);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return allItems;
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
    if (Array.isArray(value)) return value as KeywordRule[];
    if (value && typeof value === 'object' && Array.isArray((value as { rules?: unknown[] }).rules)) {
      return (value as { rules: KeywordRule[] }).rules;
    }
    return [];
  }

  private async notifyTelegram(event: Event) {
    try {
      const formattedDate = event.eventDate
        ? new Date(event.eventDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';

      const lines = [
        '<b>🔔 SỰ KIỆN ĐỐI THỦ MỚI</b>',
        `<b>Thương hiệu:</b> ${event.sourceName}`,
        `<b>Tiêu đề:</b> ${event.title}`,
        `<b>Loại sự kiện:</b> ${event.type}`,
        formattedDate ? `<b>Thời gian:</b> ${formattedDate}` : '',
        `<b>Chi tiết:</b> ${event.url}`,
      ];
      const msg = lines.filter(Boolean).join('\n');
      if (event.image) {
        await this.telegramService.sendPhoto(event.image, msg);
      } else {
        await this.telegramService.sendMessage(msg);
      }
    } catch {}
  }
}
