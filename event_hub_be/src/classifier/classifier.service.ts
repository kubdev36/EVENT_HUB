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

    return null;
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
