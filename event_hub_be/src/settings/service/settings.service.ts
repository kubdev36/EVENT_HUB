import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrawlSource, CrawlTarget } from '../../crawlers/crawler.types.js';
import { Setting } from '../entity/setting.entity.js';

type SettingsKey = 'crawler_sources' | 'telegram_config' | 'keyword_rules' | 'department_rules';
type CrawlerSourcesSetting =
  | { targets?: Array<Record<string, unknown>>; sources?: Array<Record<string, unknown>> }
  | Array<Record<string, unknown>>;

import { TelegramConfig, TelegramService } from '../../telegram/telegram.service.js';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly telegramService: TelegramService,
  ) {}

  async getAllSettings() {
    const settings = await this.settingRepository.find();

    return settings.reduce<Record<string, unknown>>((result, setting) => {
      result[setting.key] = setting.value;
      return result;
    }, {});
  }

  async saveSetting(key: SettingsKey, value: unknown) {
    let setting = await this.settingRepository.findOne({ where: { key } });
    const normalizedValue = this.normalizeSettingValue(key, value);

    if (!setting) {
      setting = this.settingRepository.create({ key, value: normalizedValue });
    } else {
      setting.value = normalizedValue;
    }

    const saved = await this.settingRepository.save(setting);
    return {
      message: 'Setting saved successfully',
      key: saved.key,
      value: saved.value,
      updatedAt: saved.updatedAt,
    };
  }

  async testTelegramMessage(data: unknown) {
    const config = data as TelegramConfig;
    const testMessage = '<b>[Event Hub] Tin nhắn thử nghiệm Telegram Bot!</b>\nCấu hình Bot Token và Chat ID đã kết nối thành công!';
    const result = await this.telegramService.sendMessage(testMessage, config);

    return {
      message: result.ok ? 'Đã gửi tin nhắn thử nghiệm Telegram thành công.' : `Kiểm tra Telegram thất bại: ${result.description || result.message || 'Lỗi không xác định'}`,
      result,
    };
  }

  async getCrawlerTarget(id: string): Promise<CrawlTarget> {
    if (!id) {
      throw new NotFoundException('Crawler target id is required.');
    }

    const sources = await this.settingRepository.findOne({ where: { key: 'crawler_sources' } });
    const list = this.getCrawlerSourcesList(sources?.value as CrawlerSourcesSetting | undefined);
    const target = list.find((item: CrawlSource) => item.id === id);

    if (!target) {
      throw new NotFoundException('Crawler target not found.');
    }

    return target as CrawlTarget;
  }

  private normalizeSettingValue(key: SettingsKey, value: unknown) {
    if (key === 'crawler_sources') {
      return this.getCrawlerSourcesList(value as CrawlerSourcesSetting);
    }

    if (key === 'keyword_rules' && this.hasArrayProperty(value, 'rules')) {
      return value.rules;
    }

    if (key === 'department_rules' && this.hasArrayProperty(value, 'rules')) {
      return value.rules;
    }

    return value;
  }

  private getCrawlerSourcesList(value?: CrawlerSourcesSetting) {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeCrawlerTarget(item));
    }

    if (this.hasArrayProperty(value, 'targets')) {
      return value.targets.map((item) => this.normalizeCrawlerTarget(item));
    }

    if (this.hasArrayProperty(value, 'sources')) {
      return value.sources.map((item) => this.normalizeCrawlerTarget(item));
    }

    return [];
  }

  private normalizeCrawlerTarget(item: Record<string, unknown>) {
    const type = item.type === 'facebook' ? 'facebook' : 'web';
    const targetUrls = Array.isArray(item.targetUrls)
      ? item.targetUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      : [];

    return {
      id: String(item.id || '').trim(),
      name: String(item.name || '').trim(),
      type,
      logo: typeof item.logo === 'string' ? item.logo : null,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      interval: typeof item.interval === 'string' ? item.interval : '6h',
      targetUrls,
    } satisfies CrawlSource;
  }

  private hasArrayProperty<T extends string>(
    value: unknown,
    property: T,
  ): value is Record<T, Array<Record<string, unknown>>> {
    return typeof value === 'object' && value !== null && Array.isArray((value as Record<T, unknown>)[property]);
  }
}
