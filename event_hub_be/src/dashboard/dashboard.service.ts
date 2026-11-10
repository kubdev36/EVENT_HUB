import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CrawlerRun } from '../crawlers/entity/crawler-run.entity.js';
import { DateExtractorHelper } from '../crawlers/helpers/date-extractor.helper.js';
import { Event } from '../events/entity/event.entity.js';
import { expandEventType } from '../events/event-types.js';
import { isValidImageName } from '../images/image-storage.js';
import { EventsService } from '../events/service/events.service.js';
import { Setting } from '../settings/entity/setting.entity.js';
import { DashboardFilterDto } from './dto/dashboard-query.dto.js';
import { countProductMentions, TrackedProduct } from './product-matcher.js';

type RequestUser = {
  id: string;
  email: string;
  role: string;
  department?: string | null;
};

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 400;
const DEFAULT_RANGE_DAYS = 7;
const PROMO_WINDOW_DAYS = 14;
/** Nguồn nội bộ, không phải đối thủ: mặc định không tính vào dashboard. */
const OWN_SOURCE_IDS = ['minhtuan'];

export type ResolvedFilter = {
  /** Ngày theo lịch Việt Nam, dạng YYYY-MM-DD (tính cả hai đầu). */
  fromDay: string;
  toDay: string;
  /** Mốc thời gian thật: [start, end). */
  start: Date;
  end: Date;
  days: number;
  brands: string[] | null;
  types: string[] | null;
  /** null = xem mọi loại (admin); [] = không được xem gì. */
  allowed: string[] | null;
  /** Tính cả bài của nguồn nội bộ (Minh Tuấn Mobile) khi không chọn hãng cụ thể. */
  includeOwn: boolean;
  /** Chỉ bài có ảnh http(s). */
  hasImage: boolean;
};

/**
 * Số liệu cho trang Tổng quan và Báo cáo. Mọi phép đếm chạy trong SQL; quyền theo phòng ban
 * nằm trong điều kiện truy vấn nên không bị thiếu bài như khi lọc sau khi đã cắt N dòng.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(CrawlerRun)
    private readonly runRepository: Repository<CrawlerRun>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly eventsService: EventsService,
  ) {}

  async resolveFilter(
    dto: DashboardFilterDto,
    user: RequestUser | undefined,
    now = new Date(),
  ): Promise<ResolvedFilter> {
    const today = DashboardService.vnDay(now);
    const toDay = dto.to ?? today;
    const fromDay =
      dto.from ?? DashboardService.addDays(toDay, -(DEFAULT_RANGE_DAYS - 1));
    const start = DashboardService.vnDayStart(fromDay);
    const end = new Date(DashboardService.vnDayStart(toDay).getTime() + DAY_MS);
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    if (!(days >= 1))
      throw new BadRequestException('from phải trước hoặc bằng to');
    if (days > MAX_RANGE_DAYS)
      throw new BadRequestException(
        `Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày`,
      );

    const brands = dto.brands
      ? dto.brands
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
    const types =
      dto.type && dto.type !== 'all' ? expandEventType(dto.type) : null;
    const allowed = await this.eventsService.getAllowedTypes(user as never);
    return {
      fromDay,
      toDay,
      start,
      end,
      days,
      brands: brands?.length ? brands : null,
      types,
      allowed,
      includeOwn: dto.includeOwn === 'true',
      hasImage: dto.hasImage === 'true',
    };
  }

  /** Điều kiện chung: có ngày đăng, trong khoảng, đúng hãng/loại và đúng quyền. */
  applyFilter(
    qb: SelectQueryBuilder<Event>,
    f: ResolvedFilter,
    range: { start: Date; end: Date } = f,
  ) {
    qb.where('e.dateUnknown = false').andWhere(
      'e.eventDate >= :start AND e.eventDate < :end',
      { start: range.start, end: range.end },
    );
    if (f.brands)
      qb.andWhere('e.sourceId IN (:...brands)', { brands: f.brands });
    else if (!f.includeOwn)
      qb.andWhere('e.sourceId NOT IN (:...own)', { own: OWN_SOURCE_IDS });
    if (f.hasImage) qb.andWhere("e.image LIKE 'http%'");
    if (f.types) qb.andWhere('e.type IN (:...types)', { types: f.types });
    if (f.allowed) {
      if (f.allowed.length === 0) qb.andWhere('1 = 0');
      else qb.andWhere('e.type IN (:...allowed)', { allowed: f.allowed });
    }
    return qb;
  }

  private qb() {
    return this.eventRepository.createQueryBuilder('e');
  }

  private vnExpr() {
    // eventDate là timestamptz: đổi sang giờ Việt Nam để nhóm theo ngày/giờ, không phụ thuộc
    // múi giờ của server hay của phiên Postgres.
    return `(e."eventDate" AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  }

  /** Chỉ số tổng: kỳ này, kỳ trước cùng độ dài, theo hãng, khuyến mãi gần đây, tình trạng nguồn. */
  async summary(f: ResolvedFilter) {
    const prev = {
      start: new Date(f.start.getTime() - f.days * DAY_MS),
      end: f.start,
    };
    const countBySource = async (range: { start: Date; end: Date }) => {
      const rows: Array<{ sourceId: string; n: string }> =
        await this.applyFilter(this.qb(), f, range)
          .select('e.sourceId', 'sourceId')
          .addSelect('COUNT(*)', 'n')
          .groupBy('e.sourceId')
          .getRawMany();
      return new Map(rows.map((r) => [r.sourceId, Number(r.n)]));
    };
    const [cur, before] = await Promise.all([
      countBySource(f),
      countBySource(prev),
    ]);

    // Khuyến mãi: bài loại promo đăng trong 14 ngày tính đến hết kỳ (bỏ qua bộ lọc loại).
    const promoFilter: ResolvedFilter = {
      ...f,
      types: expandEventType('promo'),
    };
    const promoRange = {
      start: new Date(f.end.getTime() - PROMO_WINDOW_DAYS * DAY_MS),
      end: f.end,
    };
    const activePromos = await this.applyFilter(
      this.qb(),
      promoFilter,
      promoRange,
    ).getCount();

    const meta = await this.sourceMeta();
    const ids = new Set([
      ...cur.keys(),
      ...before.keys(),
      ...(f.brands ??
        meta.filter((m) => !OWN_SOURCE_IDS.includes(m.id)).map((m) => m.id)),
    ]);
    const bySource = [...ids]
      .map((id) => ({
        sourceId: id,
        name: meta.find((m) => m.id === id)?.name ?? id,
        logo: meta.find((m) => m.id === id)?.logo ?? null,
        current: cur.get(id) ?? 0,
        previous: before.get(id) ?? 0,
      }))
      .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));

    const total = bySource.reduce((s, x) => s + x.current, 0);
    const previousTotal = bySource.reduce((s, x) => s + x.previous, 0);
    return {
      range: { from: f.fromDay, to: f.toDay, days: f.days },
      total,
      previousTotal,
      activePromos,
      bySource,
      sources: await this.sourceHealth(meta),
    };
  }

  /** Số bài mỗi ngày (giờ Việt Nam) theo hãng; ngày không có bài trả 0. */
  async timeseries(f: ResolvedFilter) {
    const rows: Array<{ day: string; sourceId: string; n: string }> =
      await this.applyFilter(this.qb(), f)
        .select(`to_char(${this.vnExpr()}, 'YYYY-MM-DD')`, 'day')
        .addSelect('e.sourceId', 'sourceId')
        .addSelect('COUNT(*)', 'n')
        .groupBy('day')
        .addGroupBy('e.sourceId')
        .getRawMany();
    const days = Array.from({ length: f.days }, (_, i) =>
      DashboardService.addDays(f.fromDay, i),
    );
    const sourceIds = [...new Set(rows.map((r) => r.sourceId))].sort();
    const index = new Map(
      rows.map((r) => [`${r.day}|${r.sourceId}`, Number(r.n)]),
    );
    return {
      days,
      series: sourceIds.map((sourceId) => ({
        sourceId,
        values: days.map((d) => index.get(`${d}|${sourceId}`) ?? 0),
      })),
    };
  }

  /** Phân rã theo loại, theo thứ + khung giờ (giờ Việt Nam), hoặc theo tuần. */
  async breakdown(f: ResolvedFilter, by: 'type' | 'weekday-hour' | 'week') {
    const qb = this.applyFilter(this.qb(), f);
    if (by === 'type') {
      const rows: Array<{ sourceId: string; type: string; n: string }> =
        await qb
          .select('e.sourceId', 'sourceId')
          .addSelect('e.type', 'type')
          .addSelect('COUNT(*)', 'n')
          .groupBy('e.sourceId')
          .addGroupBy('e.type')
          .getRawMany();
      return {
        by,
        rows: rows.map((r) => ({
          sourceId: r.sourceId,
          type: r.type,
          count: Number(r.n),
        })),
      };
    }
    if (by === 'weekday-hour') {
      // Bài chỉ có ngày (không có giờ) không tính vào khung giờ.
      const rows: Array<{ dow: string; hour: string; n: string }> = await qb
        .andWhere('e.eventTime IS NOT NULL')
        .select(`EXTRACT(ISODOW FROM ${this.vnExpr()})::int`, 'dow')
        .addSelect(`EXTRACT(HOUR FROM ${this.vnExpr()})::int`, 'hour')
        .addSelect('COUNT(*)', 'n')
        .groupBy('dow')
        .addGroupBy('hour')
        .getRawMany();
      return {
        by,
        rows: rows.map((r) => ({
          weekday: Number(r.dow),
          hour: Number(r.hour),
          count: Number(r.n),
        })),
      };
    }
    const rows: Array<{ week: string; sourceId: string; n: string }> = await qb
      .select(
        `to_char(date_trunc('week', ${this.vnExpr()}), 'YYYY-MM-DD')`,
        'week',
      )
      .addSelect('e.sourceId', 'sourceId')
      .addSelect('COUNT(*)', 'n')
      .groupBy('week')
      .addGroupBy('e.sourceId')
      .getRawMany();
    return {
      by,
      rows: rows.map((r) => ({
        week: r.week,
        sourceId: r.sourceId,
        count: Number(r.n),
      })),
    };
  }

  /**
   * Sản phẩm được nhắc nhiều nhất trong kỳ, theo danh sách sản phẩm theo dõi (setting
   * tracked_products). Chỉ đọc tiêu đề của các bài đã qua bộ lọc và phân quyền.
   */
  async products(f: ResolvedFilter, limit = 10) {
    const setting = await this.settingRepository.findOne({
      where: { key: 'tracked_products' },
    });
    const products = DashboardService.trackedProducts(setting?.value);
    if (!products.length) return { configured: 0, rows: [] };
    const rows: Array<{ title: string | null }> = await this.applyFilter(
      this.qb(),
      f,
    )
      .select('e.title', 'title')
      .getRawMany();
    return {
      configured: products.length,
      rows: countProductMentions(
        rows.map((r) => r.title ?? ''),
        products,
      ).slice(0, limit),
    };
  }

  /** Đọc setting tracked_products, bỏ mục sai dạng. */
  static trackedProducts(value: unknown): TrackedProduct[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((p: unknown) => {
      const item = p as { name?: unknown; aliases?: unknown };
      if (typeof item?.name !== 'string' || !item.name.trim()) return [];
      const aliases = Array.isArray(item.aliases)
        ? item.aliases.filter((a): a is string => typeof a === 'string')
        : [];
      return [{ name: item.name.trim(), aliases }];
    });
  }

  /** Danh sách bài mới nhất trước, phân trang bằng con trỏ (eventDate, id). Không trả rawData. */
  async list(f: ResolvedFilter, limit = 20, cursor?: string, search?: string) {
    const qb = this.applyFilter(this.qb(), f)
      .select([
        'e.id',
        'e.sourceId',
        'e.sourceName',
        'e.title',
        'e.description',
        'e.image',
        'e.imageStoredPath',
        'e.url',
        'e.type',
        'e.eventDate',
        'e.eventTime',
        'e.origin',
      ])
      .orderBy('e.eventDate', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .take(limit + 1);
    const term = search?.trim();
    if (term) {
      // Ký tự đặc biệt của LIKE (%, _ và ký tự escape "!") được escape: gõ "50%" tìm đúng chuỗi "50%".
      const pattern = `%${term.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
      qb.andWhere(
        "(e.title ILIKE :pattern ESCAPE '!' OR e.sourceName ILIKE :pattern ESCAPE '!')",
        { pattern },
      );
    }
    if (cursor) {
      const c = DashboardService.decodeCursor(cursor);
      qb.andWhere(
        '(e.eventDate < :cd OR (e.eventDate = :cd AND e.id < :cid))',
        { cd: c.d, cid: c.id },
      );
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((e) => ({
        id: e.id,
        sourceId: e.sourceId,
        sourceName: e.sourceName,
        title: e.title,
        description: e.description ? e.description.slice(0, 300) : null,
        image: e.image && /^https?:\/\//i.test(e.image) ? e.image : null,
        imageLocal:
          e.imageStoredPath && isValidImageName(e.imageStoredPath)
            ? `/images/${e.imageStoredPath}`
            : null,
        url: /^https?:\/\//i.test(e.url) ? e.url : null,
        type: e.type,
        origin: e.origin,
        date: e.eventDate
          ? DashboardService.vnDay(new Date(e.eventDate))
          : null,
        time: e.eventTime,
      })),
      nextCursor:
        rows.length > limit && last?.eventDate
          ? DashboardService.encodeCursor(new Date(last.eventDate), last.id)
          : null,
    };
  }

  /** Danh sách nguồn đang cấu hình (nhẹ, cho thanh menu). own = nguồn nội bộ. */
  async sources() {
    const meta = await this.sourceMeta();
    return meta.map((m) => ({ ...m, own: OWN_SOURCE_IDS.includes(m.id) }));
  }

  private async sourceMeta(): Promise<
    Array<{ id: string; name: string; logo: string | null }>
  > {
    const setting = await this.settingRepository.findOne({
      where: { key: 'crawler_sources' },
    });
    const value = setting?.value as unknown;
    const list = Array.isArray(value)
      ? value
      : ((value as { targets?: unknown[]; sources?: unknown[] } | undefined)
          ?.targets ??
        (value as { sources?: unknown[] } | undefined)?.sources ??
        []);
    return (list as Array<Record<string, unknown>>)
      .filter((s) => typeof s.id === 'string')
      .map((s) => ({
        id: String(s.id),
        name: typeof s.name === 'string' ? s.name : String(s.id),
        logo: typeof s.logo === 'string' && s.logo ? s.logo : null,
      }));
  }

  /** Lần cào gần nhất của từng nguồn đang cấu hình. */
  private async sourceHealth(meta: Array<{ id: string; name: string }>) {
    const ids = meta
      .filter((m) => !OWN_SOURCE_IDS.includes(m.id))
      .map((m) => m.id);
    if (ids.length === 0) return [];
    const runs: Array<Record<string, unknown>> = (await this.runRepository
      .createQueryBuilder('r')
      .distinctOn(['r.sourceId'])
      .where('r.sourceId IN (:...ids)', { ids })
      .orderBy('r.sourceId')
      .addOrderBy('r.startedAt', 'DESC')
      .getMany()) as unknown as Array<Record<string, unknown>>;
    const byId = new Map(
      runs.map((r) => [r.sourceId as string, r as unknown as CrawlerRun]),
    );
    return ids.map((id) => {
      const r = byId.get(id);
      return {
        sourceId: id,
        name: meta.find((m) => m.id === id)?.name ?? id,
        status: r?.status ?? null,
        startedAt: r?.startedAt ?? null,
        itemsFound: r?.itemsFound ?? 0,
        newItems: r?.newItems ?? 0,
        durationMs: r?.durationMs ?? null,
        errorMessage: r?.errorMessage ? r.errorMessage.slice(0, 300) : null,
      };
    });
  }

  static vnDay(d: Date): string {
    const p = DateExtractorHelper.vnParts(d);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }

  static vnDayStart(day: string): Date {
    const [y, m, d] = day.split('-').map(Number);
    return DateExtractorHelper.vnDate(y, m, d, 0, 0);
  }

  static addDays(day: string, n: number): string {
    return DashboardService.vnDay(
      new Date(
        DashboardService.vnDayStart(day).getTime() +
          n * DAY_MS +
          12 * 3_600_000,
      ),
    );
  }

  static encodeCursor(d: Date, id: string): string {
    return Buffer.from(JSON.stringify({ d: d.toISOString(), id })).toString(
      'base64url',
    );
  }

  static decodeCursor(cursor: string): { d: Date; id: string } {
    try {
      const raw = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { d?: unknown; id?: unknown };
      const d = new Date(String(raw.d));
      if (Number.isNaN(d.getTime()) || typeof raw.id !== 'string')
        throw new Error('invalid');
      return { d, id: raw.id };
    } catch {
      throw new BadRequestException('cursor không hợp lệ');
    }
  }
}
