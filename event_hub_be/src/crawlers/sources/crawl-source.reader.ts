import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../../settings/entity/setting.entity.js';
import { CrawlTarget, KeywordRule } from '../crawler.types.js';

/** Đọc cấu hình nguồn crawl và từ khóa phân loại từ bảng settings (chỉ đọc). */
@Injectable()
export class CrawlSourceReader {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  /** crawler_sources lưu dạng mảng hoặc { targets } / { sources }. */
  async getTargets(): Promise<CrawlTarget[]> {
    const setting = await this.settingRepository.findOne({
      where: { key: 'crawler_sources' },
    });
    if (!setting?.value) return [];
    if (Array.isArray(setting.value)) return setting.value as CrawlTarget[];
    if (typeof setting.value === 'object') {
      const obj = setting.value as {
        targets?: CrawlTarget[];
        sources?: CrawlTarget[];
      };
      if (Array.isArray(obj.targets)) return obj.targets;
      if (Array.isArray(obj.sources)) return obj.sources;
    }
    return [];
  }

  async getTargetById(id: string): Promise<CrawlTarget> {
    const target = (await this.getTargets()).find((item) => item.id === id);
    if (!target) throw new Error('Crawler target not found.');
    return target;
  }

  async getKeywordRules(): Promise<KeywordRule[]> {
    const setting = await this.settingRepository.findOne({
      where: { key: 'keyword_rules' },
    });
    const value = setting?.value;
    if (Array.isArray(value)) return value as KeywordRule[];
    if (
      value &&
      typeof value === 'object' &&
      Array.isArray((value as { rules?: unknown[] }).rules)
    ) {
      return (value as { rules: KeywordRule[] }).rules;
    }
    return [];
  }
}
