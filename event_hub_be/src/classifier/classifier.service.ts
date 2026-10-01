import { Injectable } from '@nestjs/common';

type KeywordRule = {
  type: string;
  keywords: string;
};

@Injectable()
export class ClassifierService {
  classify(title: string, description = '', rules: KeywordRule[] = []): string | null {
    const text = this.normalize(`${title} ${description}`);

    for (const rule of rules) {
      const keywords = rule.keywords
        .split(/[,;\n]+/)
        .map((keyword) => this.normalize(keyword))
        .filter(Boolean);

      if (keywords.some((keyword) => text.includes(keyword))) {
        return this.normalizeType(rule.type);
      }
    }

    // Smart built-in fallback rules for retail tech events
    if (
      /khuyen mai|uu dai|giam gia|sale|gia soc|voucher|giam sau|tra gop|qua tang|mua ngay|gia chi tu|giam den|hot sale|flash sale|sieu sale|deal|chi tu/i.test(
        text,
      )
    ) {
      return 'promo';
    }

    if (
      /ra mat|mo ban|pre order|dat truoc|chinh thuc ra mat|chase the wild|su kien|unpacked|apple event|launch|series|the he moi/i.test(
        text,
      )
    ) {
      return 'product_launch';
    }

    if (/minigame|giveaway|doan gia|tang qua|trung thuong|con test|vong quay/i.test(text)) {
      return 'minigame';
    }

    // Default fallback so monitored competitor posts are never dropped
    return 'ads';
  }

  private normalize(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeType(type: string) {
    const value = this.normalize(type);

    return value || null;
  }
}
