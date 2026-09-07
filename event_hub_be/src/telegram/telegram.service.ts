import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../settings/entity/setting.entity.js';

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

  async getTelegramConfig(): Promise<TelegramConfig> {
    try {
      const setting = await this.settingRepository.findOne({ where: { key: 'telegram_config' } });
      const dbConfig = setting?.value as TelegramConfig | undefined;

      const botToken = dbConfig?.botToken || this.configService.get<string>('telegram_bot_token') || '';
      const chatId = dbConfig?.chatId || this.configService.get<string>('telegram_chat_id') || '';
      const notifyImmediately = typeof dbConfig?.notifyImmediately === 'boolean' ? dbConfig.notifyImmediately : true;
      const includeImage = typeof dbConfig?.includeImage === 'boolean' ? dbConfig.includeImage : true;

      return { botToken, chatId, notifyImmediately, includeImage };
    } catch {
      return {
        botToken: this.configService.get<string>('telegram_bot_token') || '',
        chatId: this.configService.get<string>('telegram_chat_id') || '',
        notifyImmediately: true,
        includeImage: true,
      };
    }
  }

  async sendMessage(text: string, customConfig?: TelegramConfig) {
    const config = customConfig || (await this.getTelegramConfig());
    if (!config.botToken || !config.chatId) {
      return { ok: false, skipped: true, message: 'Telegram is not configured.' };
    }

    if (customConfig === undefined && config.notifyImmediately === false) {
      return { ok: false, skipped: true, message: 'Immediate notification is disabled.' };
    }

    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    return response.json();
  }

  async sendPhoto(photoUrl: string, caption: string, customConfig?: TelegramConfig) {
    const config = customConfig || (await this.getTelegramConfig());
    if (!config.botToken || !config.chatId) {
      return { ok: false, skipped: true, message: 'Telegram is not configured.' };
    }

    if (customConfig === undefined && config.notifyImmediately === false) {
      return { ok: false, skipped: true, message: 'Immediate notification is disabled.' };
    }

    if (config.includeImage === false) {
      return this.sendMessage(caption, config);
    }

    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
      }),
    });

    return response.json();
  }
}
