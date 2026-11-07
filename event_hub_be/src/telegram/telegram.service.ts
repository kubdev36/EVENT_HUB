import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../settings/entity/setting.entity.js';
import {
  decryptSecret,
  isEncrypted,
  loadEncryptionKey,
} from '../common/secret-box.js';

export type TelegramConfig = {
  botToken?: string;
  chatId?: string;
  notifyImmediately?: boolean;
  includeImage?: boolean;
};

@Injectable()
export class TelegramService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  /** Cấu hình Telegram đã giải mã token. Lỗi đọc DB hoặc giải mã được ném ra, không nuốt. */
  async getTelegramConfig(): Promise<TelegramConfig> {
    const setting = await this.settingRepository.findOne({
      where: { key: 'telegram_config' },
    });
    const dbConfig = setting?.value as TelegramConfig | undefined;

    const stored = TelegramService.decryptToken(dbConfig?.botToken);
    const botToken =
      stored || this.configService.get<string>('telegram_bot_token') || '';
    const chatId =
      dbConfig?.chatId ||
      this.configService.get<string>('telegram_chat_id') ||
      '';
    const notifyImmediately =
      typeof dbConfig?.notifyImmediately === 'boolean'
        ? dbConfig.notifyImmediately
        : true;
    const includeImage =
      typeof dbConfig?.includeImage === 'boolean'
        ? dbConfig.includeImage
        : true;

    return { botToken, chatId, notifyImmediately, includeImage };
  }

  /** Token lưu trong DB: đã mã hóa thì giải mã; dữ liệu cũ chưa mã hóa vẫn đọc được. */
  static decryptToken(value: string | undefined): string {
    if (!value) return '';
    if (!isEncrypted(value)) return value;
    const key = loadEncryptionKey();
    if (!key)
      throw new Error(
        'Token Telegram đã mã hóa nhưng chưa cấu hình SETTINGS_ENC_KEY',
      );
    return decryptSecret(value, key);
  }

  async sendMessage(text: string, customConfig?: TelegramConfig) {
    const config = customConfig || (await this.getTelegramConfig());
    if (!config.botToken || !config.chatId) {
      return {
        ok: false,
        skipped: true,
        message: 'Telegram is not configured.',
      };
    }

    if (customConfig === undefined && config.notifyImmediately === false) {
      return {
        ok: false,
        skipped: true,
        message: 'Immediate notification is disabled.',
      };
    }

    const response = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      },
    );

    return response.json();
  }

  async sendPhoto(
    photoUrl: string,
    caption: string,
    customConfig?: TelegramConfig,
  ) {
    const config = customConfig || (await this.getTelegramConfig());
    if (!config.botToken || !config.chatId) {
      return {
        ok: false,
        skipped: true,
        message: 'Telegram is not configured.',
      };
    }

    if (customConfig === undefined && config.notifyImmediately === false) {
      return {
        ok: false,
        skipped: true,
        message: 'Immediate notification is disabled.',
      };
    }

    if (config.includeImage === false) {
      return this.sendMessage(caption, config);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendPhoto`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          photo: photoUrl,
          caption,
          parse_mode: 'HTML',
        }),
      },
    );

    return response.json();
  }
}
