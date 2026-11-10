import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  encryptSecret,
  loadEncryptionKey,
  maskSecret,
} from '../../common/secret-box.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrawlSource, CrawlTarget } from '../../crawlers/crawler.types.js';
import { Setting } from '../entity/setting.entity.js';

type SettingsKey =
  | 'crawler_sources'
  | 'telegram_config'
  | 'keyword_rules'
  | 'department_rules'
  | 'departments_list'
  | 'tracked_products';
type CrawlerSourcesSetting =
  | {
      targets?: Array<Record<string, unknown>>;
      sources?: Array<Record<string, unknown>>;
    }
  | Array<Record<string, unknown>>;

import {
  TelegramConfig,
  TelegramService,
} from '../../telegram/telegram.service.js';

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
      result[setting.key] =
        setting.key === 'telegram_config'
          ? SettingsService.maskTelegram(setting.value)
          : setting.value;
      return result;
    }, {});
  }

  /** Không bao giờ trả token Telegram ra ngoài: chỉ báo đã có token và 4 ký tự cuối. */
  static maskTelegram(value: unknown) {
    const cfg = (value ?? {}) as TelegramConfig;
    let masked: string | null = null;
    if (cfg.botToken) {
      try {
        masked = maskSecret(TelegramService.decryptToken(cfg.botToken));
      } catch {
        // Không giải mã được (sai khóa): vẫn báo là có token nhưng không hiện ký tự nào.
        masked = '••••';
      }
    }
    return {
      chatId: cfg.chatId ?? '',
      notifyImmediately: cfg.notifyImmediately,
      includeImage: cfg.includeImage,
      botTokenSet: Boolean(cfg.botToken),
      botTokenMasked: masked,
    };
  }

  /**
   * Lưu cấu hình Telegram, token được mã hóa. Ô token để trống nghĩa là giữ token cũ.
   * Không trả token về.
   */
  async saveTelegramConfig(data: TelegramConfig) {
    const existing = await this.settingRepository.findOne({
      where: { key: 'telegram_config' },
    });
    const old = (existing?.value ?? {}) as TelegramConfig;
    const token = data.botToken?.trim();
    let botToken = old.botToken;
    if (token) {
      const key = loadEncryptionKey();
      if (!key)
        throw new BadRequestException(
          'Chưa cấu hình SETTINGS_ENC_KEY nên không lưu được token Telegram.',
        );
      botToken = encryptSecret(token, key);
    }
    const value = {
      botToken,
      chatId: data.chatId,
      notifyImmediately: data.notifyImmediately,
      includeImage: data.includeImage,
    };
    const setting =
      existing ?? this.settingRepository.create({ key: 'telegram_config' });
    setting.value = value;
    const saved = await this.settingRepository.save(setting);
    return {
      message: 'Setting saved successfully',
      key: saved.key,
      value: SettingsService.maskTelegram(saved.value),
      updatedAt: saved.updatedAt,
    };
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
    const input = data as TelegramConfig;
    // Ô token để trống: gửi thử bằng token đã lưu.
    const config = input.botToken?.trim()
      ? input
      : {
          ...input,
          botToken: (await this.telegramService.getTelegramConfig()).botToken,
        };
    const testMessage =
      '<b>[Event Hub] Tin nhắn thử nghiệm Telegram Bot!</b>\nCấu hình Bot Token và Chat ID đã kết nối thành công!';
    const result = await this.telegramService.sendMessage(testMessage, config);

    return {
      message: result.ok
        ? 'Đã gửi tin nhắn thử nghiệm Telegram thành công.'
        : `Kiểm tra Telegram thất bại: ${result.description || result.message || 'Lỗi không xác định'}`,
      result,
    };
  }

  async getCrawlerTarget(id: string): Promise<CrawlTarget> {
    if (!id) {
      throw new NotFoundException('Crawler target id is required.');
    }

    const sources = await this.settingRepository.findOne({
      where: { key: 'crawler_sources' },
    });
    const list = this.getCrawlerSourcesList(
      sources?.value as CrawlerSourcesSetting | undefined,
    );
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

    if (key === 'departments_list' && this.hasArrayProperty(value, 'list')) {
      return value.list;
    }

    if (key === 'tracked_products' && this.hasArrayProperty(value, 'products')) {
      // Bỏ khoảng trắng thừa, bỏ cách viết rỗng hoặc trùng.
      return value.products.map((p) => {
        const item = p as { name: string; aliases: string[] };
        const name = item.name.trim();
        const aliases = [
          ...new Set(item.aliases.map((a) => a.trim()).filter(Boolean)),
        ].filter((a) => a.toLowerCase() !== name.toLowerCase());
        return { name, aliases };
      });
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
      ? item.targetUrls.filter(
          (url): url is string =>
            typeof url === 'string' && url.trim().length > 0,
        )
      : [];

    const isObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);

    // Giữ cấu hình riêng của nguồn (đã được DTO kiểm tra); bỏ đi thì lưu từ giao diện sẽ xóa mất.
    return {
      id: String(item.id || '').trim(),
      name: String(item.name || '').trim(),
      type,
      logo: typeof item.logo === 'string' ? item.logo : null,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      interval: typeof item.interval === 'string' ? item.interval : '6h',
      targetUrls,
      ...(typeof item.ajaxEndpoint === 'string'
        ? { ajaxEndpoint: item.ajaxEndpoint }
        : {}),
      ...(typeof item.ajaxPayload === 'string'
        ? { ajaxPayload: item.ajaxPayload }
        : {}),
      ...(typeof item.paginationType === 'string'
        ? { paginationType: item.paginationType }
        : {}),
      ...(isObject(item.extract)
        ? { extract: item.extract as CrawlSource['extract'] }
        : {}),
      ...(isObject(item.api) ? { api: item.api as CrawlSource['api'] } : {}),
      ...(typeof item.minRequestIntervalMs === 'number'
        ? { minRequestIntervalMs: item.minRequestIntervalMs }
        : {}),
      ...(typeof item.storeImages === 'boolean'
        ? { storeImages: item.storeImages }
        : {}),
    } satisfies CrawlSource;
  }

  private hasArrayProperty<T extends string>(
    value: unknown,
    property: T,
  ): value is Record<T, Array<Record<string, unknown>>> {
    return (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray((value as Record<T, unknown>)[property])
    );
  }
}
