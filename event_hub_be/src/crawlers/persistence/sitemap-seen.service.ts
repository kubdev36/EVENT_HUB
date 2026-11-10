import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SitemapSeenUrl } from '../entity/sitemap-seen-url.entity.js';
import type { SitemapEntry } from '../engine/generic-sitemap.engine.js';

export type PendingSeen = {
  sourceId: string;
  sitemapUrl: string;
  entries: SitemapEntry[];
};

const INSERT_CHUNK = 500;

/** Lưu link đã thấy trong sitemap, theo nguồn. */
@Injectable()
export class SitemapSeenService {
  constructor(
    @InjectRepository(SitemapSeenUrl)
    private readonly repo: Repository<SitemapSeenUrl>,
  ) {}

  /** Sitemap này đã có lần chạy đầu (đã ghi link) chưa. */
  async hasBaseline(sourceId: string, sitemapUrl: string): Promise<boolean> {
    return (
      (await this.repo.count({ where: { sourceId, sitemapUrl }, take: 1 })) > 0
    );
  }

  async loadSeenUrls(sourceId: string): Promise<Set<string>> {
    const rows = await this.repo.find({
      where: { sourceId },
      select: { url: true },
    });
    return new Set(rows.map((r) => r.url));
  }

  /** Ghi link đã thấy; link đã có thì bỏ qua. */
  async markSeen(pending: PendingSeen): Promise<void> {
    const rows = pending.entries.map((e) => ({
      sourceId: pending.sourceId,
      sitemapUrl: pending.sitemapUrl,
      url: e.url.slice(0, 2048),
      lastmod: e.lastmod,
    }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(SitemapSeenUrl)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .orIgnore()
        .execute();
    }
  }
}
