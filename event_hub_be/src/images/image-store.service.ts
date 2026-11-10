import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { IsNull, Repository } from 'typeorm';
import { CrawlerHttpClient } from '../crawlers/engine/crawler-http.client.js';
import type { CrawlTarget } from '../crawlers/crawler.types.js';
import { Event, ImageStoreStatus } from '../events/entity/event.entity.js';
import { ImageStorage } from './image-storage.js';

/** Ảnh gốc lớn hơn mức này thì bỏ qua. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Chống "bom giải nén": ảnh quá nhiều điểm ảnh thì sharp từ chối. */
const MAX_INPUT_PIXELS = 40_000_000;
const THUMB_WIDTH = 600;
const WEBP_QUALITY = 75;
/** Số ảnh tối đa lưu sau mỗi lần cào một nguồn (bài mới trước, rồi bài cũ). */
export const MAX_IMAGES_PER_RUN = 50;
/** Khoảng cách tối thiểu giữa hai request tới host ảnh (CDN) không phải host của nguồn. */
const IMAGE_HOST_INTERVAL_MS = 1000;
/** Kiểu ảnh nhận; không nhận SVG vì là tài liệu có thể chứa script/tham chiếu ngoài. */
const ACCEPTED_TYPES = /^image\/(jpeg|jpg|pjpeg|png|webp|gif|avif)\b/;

export type StoreResult =
  | { status: 'stored'; name: string }
  | { status: Exclude<ImageStoreStatus, 'stored' | 'skipped'>; reason: string };

@Injectable()
export class ImageStoreService {
  private readonly logger = new Logger(ImageStoreService.name);
  /** Nguồn đang lưu ảnh, tránh hai lượt chạy chồng cho cùng nguồn trong một process. */
  private readonly running = new Set<string>();

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly httpClient: CrawlerHttpClient,
    private readonly storage: ImageStorage,
  ) {}

  /** Tên file theo link ảnh gốc: hai bài chung một ảnh dùng chung một file. */
  static fileNameFor(url: string): string {
    return `${createHash('sha256').update(url).digest('hex')}.webp`;
  }

  static shouldStore(target: Pick<CrawlTarget, 'type' | 'storeImages'>) {
    return target.storeImages ?? target.type !== 'facebook';
  }

  /** Tải, thu nhỏ và lưu một ảnh. Không ném lỗi: mọi thất bại trả về kèm lý do. */
  async storeUrl(url: string): Promise<StoreResult> {
    if (!/^https?:\/\//i.test(url))
      return { status: 'failed', reason: 'Link ảnh không phải http(s)' };
    const name = ImageStoreService.fileNameFor(url);
    if (await this.storage.exists(name)) return { status: 'stored', name };

    const res = await this.httpClient.fetchBinary(url, MAX_IMAGE_BYTES);
    if (res.kind !== 'ok') return { status: res.kind, reason: res.reason };
    if (!ACCEPTED_TYPES.test(res.contentType))
      return {
        status: 'failed',
        reason: `Không phải ảnh được hỗ trợ (${res.contentType || 'không rõ'})`,
      };

    let thumb: Buffer;
    try {
      thumb = await sharp(res.body, {
        limitInputPixels: MAX_INPUT_PIXELS,
        animated: false,
      })
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    } catch (err) {
      return {
        status: 'failed',
        reason: `Không đọc được ảnh: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    await this.storage.save(name, thumb);
    return { status: 'stored', name };
  }

  /**
   * Lưu ảnh cho các bài của nguồn chưa từng thử lưu, bài mới trước. Nguồn không lưu ảnh
   * thì đánh dấu skipped để biết đã xét.
   */
  async storeForTarget(
    target: CrawlTarget,
    limit = MAX_IMAGES_PER_RUN,
  ): Promise<{
    stored: number;
    failed: number;
    blocked: number;
    skipped: number;
  }> {
    const counts = { stored: 0, failed: 0, blocked: 0, skipped: 0 };
    if (this.running.has(target.id)) return counts;
    this.running.add(target.id);
    try {
      if (!ImageStoreService.shouldStore(target)) {
        const res = await this.eventRepository
          .createQueryBuilder()
          .update(Event)
          .set({ imageStoreStatus: 'skipped', imageStoredAt: new Date() })
          .where('"sourceId" = :id', { id: target.id })
          .andWhere('"imageStoreStatus" IS NULL')
          .andWhere(`image ~* '^https?://'`)
          .execute();
        counts.skipped = res.affected ?? 0;
        return counts;
      }

      const events = await this.eventRepository
        .createQueryBuilder('e')
        .select(['e.id', 'e.image'])
        .where('e.sourceId = :id', { id: target.id })
        .andWhere('e.imageStoreStatus IS NULL')
        .andWhere(`e.image ~* '^https?://'`)
        .orderBy('e.firstSeenAt', 'DESC')
        .take(limit)
        .getMany();

      const sourceHosts = new Set(
        (target.targetUrls || []).map((u) => CrawlerHttpClient.hostKey(u)),
      );
      for (const e of events) {
        const host = CrawlerHttpClient.hostKey(e.image!);
        if (!sourceHosts.has(host))
          this.httpClient.setHostInterval(host, IMAGE_HOST_INTERVAL_MS);

        const result = await this.storeUrl(e.image!);
        counts[result.status] += 1;
        await this.eventRepository.update(
          { id: e.id, image: e.image!, imageStoreStatus: IsNull() },
          {
            imageStoreStatus: result.status,
            imageStoredAt: new Date(),
            imageStoredPath: result.status === 'stored' ? result.name : null,
          },
        );
        if (result.status !== 'stored')
          this.logger.debug(`Không lưu được ảnh ${e.image}: ${result.reason}`);
      }
      if (events.length)
        this.logger.log(
          `Lưu ảnh ${target.id}: ${counts.stored} lưu, ${counts.failed} lỗi, ${counts.blocked} bị chặn`,
        );
      return counts;
    } finally {
      this.running.delete(target.id);
    }
  }
}
