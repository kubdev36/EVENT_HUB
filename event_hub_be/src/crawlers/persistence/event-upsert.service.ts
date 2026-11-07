import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Event } from '../../events/entity/event.entity.js';
import { CrawlTarget, ParsedCrawlItem } from '../crawler.types.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';

/** Event có ngày đăng trước mốc này bị bỏ qua (dữ liệu cũ). */
const MIN_EVENT_DATE = new Date('2025-01-01T00:00:00+07:00');
const WRITE_CHUNK = 100;

/** Các cột crawler được phép cập nhật trên event đã có. */
export type EventPatch = Partial<
  Pick<
    Event,
    | 'title'
    | 'description'
    | 'image'
    | 'imageStoredPath'
    | 'imageStoredAt'
    | 'imageStoreStatus'
    | 'eventDate'
    | 'eventTime'
    | 'dateUnknown'
    | 'externalId'
    | 'type'
  >
>;

/** Một bài đã phân loại và đã ghép với event có sẵn (nếu có). */
export type PreparedItem = {
  item: ParsedCrawlItem;
  type: string;
  contentHash: string;
  externalId: string | null;
  existing: Event | null;
};

export type ExistingIndex = {
  byExternalId: Map<string, Event>;
  byUrl: Map<string, Event>;
  byHash: Map<string, Event>;
};

/** Đọc event có sẵn của nguồn và ghi kết quả cào vào DB theo lô. */
@Injectable()
export class EventUpsertService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  /** Event có sẵn của nguồn (một truy vấn, không lấy rawData) để ghép theo externalId, URL, hash. */
  async loadExisting(sourceId: string): Promise<ExistingIndex> {
    const rows = await this.eventRepository.find({
      where: { sourceId },
      select: {
        id: true,
        url: true,
        contentHash: true,
        externalId: true,
        title: true,
        description: true,
        image: true,
        eventDate: true,
        eventTime: true,
        dateUnknown: true,
        type: true,
      },
    });
    const index: ExistingIndex = {
      byExternalId: new Map(),
      byUrl: new Map(),
      byHash: new Map(),
    };
    for (const row of rows) {
      if (row.externalId) index.byExternalId.set(row.externalId, row);
      index.byUrl.set(row.url, row);
      index.byHash.set(row.contentHash, row);
    }
    return index;
  }

  /**
   * Ghi DB theo lô: bài mới insert theo từng 100 dòng; bài đã có chỉ update cột thay đổi;
   * lastSeenAt của mọi bài đã thấy cập nhật bằng một truy vấn. Trả số bài mới.
   */
  async persist(
    target: CrawlTarget,
    prepared: PreparedItem[],
  ): Promise<number> {
    const now = new Date();
    const seenIds: string[] = [];
    const newEvents: Event[] = [];
    const newHashes = new Set<string>();

    for (const { item, type, contentHash, externalId, existing } of prepared) {
      const dateInfo = DateExtractorHelper.parseItemEventDate(item);
      const image =
        item.image && !NoiseFilterHelper.isNoiseImage(item.image)
          ? item.image
          : null;

      if (existing) {
        seenIds.push(existing.id);
        const patch = EventUpsertService.diffExisting(existing, {
          item,
          type,
          externalId,
          image,
          dateInfo,
        });
        if (Object.keys(patch).length > 0) {
          await this.eventRepository.update(existing.id, patch);
          Object.assign(existing, patch);
        }
        continue;
      }

      // Không tìm được ngày đăng thì để trống và đánh dấu dateUnknown, không dùng ngày crawl.
      const eventDate =
        dateInfo.date && !isNaN(dateInfo.date.getTime()) ? dateInfo.date : null;
      if (eventDate && eventDate < MIN_EVENT_DATE) continue;
      // Hai bài khác URL nhưng cùng contentHash trong một lần cào: chỉ giữ bài đầu.
      if (newHashes.has(contentHash)) continue;
      newHashes.add(contentHash);

      newEvents.push(
        this.eventRepository.create({
          sourceId: target.id,
          sourceName: target.name,
          origin: 'crawler',
          sourceUrl: (item.rawData?.sourceUrl as string) || item.url,
          title: item.title,
          description: item.description ?? null,
          image,
          url: item.url,
          eventDate,
          eventTime: eventDate ? dateInfo.time : null,
          dateUnknown: !eventDate,
          externalId,
          type,
          rawData: item.rawData ?? null,
          contentHash,
          firstSeenAt: now,
          lastSeenAt: now,
          notifiedAt: null,
        }),
      );
    }

    if (newEvents.length > 0) {
      await this.eventRepository.save(newEvents, { chunk: WRITE_CHUNK });
    }
    for (let i = 0; i < seenIds.length; i += 500) {
      await this.eventRepository.update(
        { id: In(seenIds.slice(i, i + 500)) },
        { lastSeenAt: now },
      );
    }
    return newEvents.length;
  }

  /** Các cột cần cập nhật cho event đã có; rỗng nếu không có gì đổi. */
  static diffExisting(
    existing: Event,
    next: {
      item: ParsedCrawlItem;
      type: string;
      externalId: string | null;
      image: string | null;
      dateInfo: { date: Date | null; time: string | null; isExplicit: boolean };
    },
  ): EventPatch {
    const patch: EventPatch = {};
    const { item, type, externalId, image, dateInfo } = next;
    if (item.title && item.title !== existing.title) patch.title = item.title;
    if (
      item.description !== undefined &&
      item.description !== null &&
      item.description !== existing.description
    )
      patch.description = item.description;
    if (image && image !== existing.image) {
      patch.image = image;
      // Ảnh đổi thì ảnh đã lưu không còn đúng: xóa trạng thái để lưu lại ảnh mới.
      patch.imageStoredPath = null;
      patch.imageStoredAt = null;
      patch.imageStoreStatus = null;
    }
    // Chỉ cập nhật ngày khi tìm được ngày thật từ bài.
    if (
      dateInfo.isExplicit &&
      dateInfo.date &&
      !isNaN(dateInfo.date.getTime())
    ) {
      const old = existing.eventDate
        ? new Date(existing.eventDate).getTime()
        : null;
      if (old !== dateInfo.date.getTime()) patch.eventDate = dateInfo.date;
      const time = dateInfo.time || existing.eventTime;
      if (time !== existing.eventTime) patch.eventTime = time;
      if (existing.dateUnknown) patch.dateUnknown = false;
    }
    if (externalId && !existing.externalId) patch.externalId = externalId;
    if (type !== existing.type) patch.type = type;
    return patch;
  }
}
