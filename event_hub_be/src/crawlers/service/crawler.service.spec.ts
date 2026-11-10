import { jest } from '@jest/globals';
import { ClassifierService } from '../../classifier/classifier.service.js';
import { Event } from '../../events/entity/event.entity.js';
import { CrawlTarget, ParsedCrawlItem } from '../crawler.types.js';
import { CrawlFetchError } from '../engine/crawler-http.client.js';
import { CrawlerService } from './crawler.service.js';
import { EventNotifierService } from '../../notifications/event-notifier.service.js';
import { EventUpsertService } from '../persistence/event-upsert.service.js';
import { CrawlPipeline } from '../pipeline/crawl-pipeline.service.js';
import { CrawlSourceReader } from '../sources/crawl-source.reader.js';

type Row = Record<string, unknown>;

/** Repository giả trong bộ nhớ, đủ cho các hàm CrawlerService đang dùng. */
function memoryRepo(rows: Row[] = []) {
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (!(v && typeof v === 'object' && '_type' in (v as object)))
        return row[k] === v;
      const op = v as { _type: string; _value?: unknown };
      if (op._type === 'in') return (op._value as unknown[]).includes(row[k]);
      return row[k] == null;
    });
  const saveOne = (row: Row) => {
    if (!row.id) row.id = `id-${rows.length + 1}`;
    if (!rows.includes(row)) rows.push(row);
    return row;
  };
  /** criteria: id, { id: In([...]) }, hoặc điều kiện đơn giản. */
  const select = (criteria: unknown): Row[] => {
    if (typeof criteria === 'string')
      return rows.filter((r) => r.id === criteria);
    const c = criteria as Row;
    const idOp = c.id as { _value?: unknown[] } | undefined;
    if (idOp && Array.isArray(idOp._value))
      return rows.filter((r) => idOp._value!.includes(r.id));
    return rows.filter((r) =>
      Object.entries(c).every(([k, v]) => {
        const op = v as { _type?: string; _value?: unknown } | null;
        if (op && typeof op === 'object' && op._type === 'lessThan')
          return (r[k] as Date) < (op._value as Date);
        return r[k] === v;
      }),
    );
  };
  const repo = {
    rows,
    create: (data: Row) => ({ ...data }),
    save: jest.fn(async (row: Row | Row[]) =>
      Array.isArray(row) ? row.map(saveOne) : saveOne(row),
    ),
    update: jest.fn(async (criteria: unknown, patch: Row) => {
      const hit = select(criteria);
      hit.forEach((r) => Object.assign(r, patch));
      return { affected: hit.length };
    }),
    findOne: async ({ where }: { where: Row | Row[] }) =>
      rows.find((r) =>
        (Array.isArray(where) ? where : [where]).some((w) => matches(r, w)),
      ) ?? null,
    find: async ({ where }: { where?: Row } = {}) =>
      rows.filter((r) => !where || matches(r, where)),
    /** Transaction giả: chạy thẳng trên repository trong bộ nhớ. */
    manager: {
      transaction: async <T>(fn: (m: unknown) => Promise<T>) =>
        fn({
          save: (_e: unknown, data: Row | Row[]) => repo.save(data),
          update: (_e: unknown, criteria: unknown, patch: Row) =>
            repo.update(criteria, patch),
        }),
    },
  };
  return repo;
}

/** Outbox giả trong bộ nhớ, cùng hợp đồng với NotificationOutboxService (không có khóa thời gian). */
function memoryOutbox() {
  const jobs: Array<{
    id: string;
    eventId: string;
    attempts: number;
    status: string;
    claimed: boolean;
  }> = [];
  return {
    jobs,
    enqueue: jest.fn(async (ids: string[]) => {
      for (const eventId of ids)
        if (!jobs.some((j) => j.eventId === eventId))
          jobs.push({
            id: `ob-${jobs.length + 1}`,
            eventId,
            attempts: 0,
            status: 'pending',
            claimed: false,
          });
    }),
    claimDue: async (limit: number) => {
      const due = jobs
        .filter((j) => j.status === 'pending' && !j.claimed)
        .slice(0, limit);
      due.forEach((j) => (j.claimed = true));
      return due.map(({ id, eventId, attempts }) => ({
        id,
        eventId,
        attempts,
      }));
    },
    markSent: async (id: string) => {
      const j = jobs.find((x) => x.id === id)!;
      j.status = 'sent';
      j.claimed = false;
    },
    markFailed: async (id: string, attempts: number) => {
      const j = jobs.find((x) => x.id === id)!;
      j.attempts = attempts + 1;
      j.claimed = false;
    },
    release: async (ids: string[]) => {
      jobs
        .filter((j) => ids.includes(j.id))
        .forEach((j) => (j.claimed = false));
    },
  };
}

function build(opts: {
  items?: Record<string, ParsedCrawlItem[] | Error>;
  telegram?: { sendMessage?: jest.Mock; sendPhoto?: jest.Mock };
  events?: Row[];
  detailPages?: Record<string, string>;
}) {
  const eventRepo = memoryRepo(opts.events);
  const runRepo = memoryRepo();
  const settingRepo = { findOne: async () => null };
  const fromMap = (url: string) => {
    const v = opts.items?.[url];
    return v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? []);
  };
  const engine = {
    fetchRssOrSitemap: fromMap,
    fetchHtmlItems: fromMap,
    fetchActiveAds: fromMap,
  };
  const telegram = {
    sendMessage:
      opts.telegram?.sendMessage ?? jest.fn(async () => ({ ok: true })),
    sendPhoto: opts.telegram?.sendPhoto ?? jest.fn(async () => ({ ok: true })),
  };
  const httpClient = {
    requestCountFor: () => 0,
    setHostInterval: jest.fn(),
    fetchPage: jest.fn(async (url: string) => {
      const html = opts.detailPages?.[url];
      return html
        ? { kind: 'ok', url, html }
        : { kind: 'failed', url, reason: 'HTTP 404' };
    }),
  };
  const imageStore = { storeForTarget: jest.fn(async () => ({})) };
  // Bài có sẵn chưa thông báo và đã rõ ngày: đã nằm trong outbox (như migration chuyển dữ liệu).
  const outbox = memoryOutbox();
  for (const e of opts.events ?? [])
    if (!e.notifiedAt && !e.dateUnknown) void outbox.enqueue([e.id as string]);
  // Khóa giả trong bộ nhớ, cùng hành vi với CrawlLockService: nguồn đang chạy thì bỏ qua.
  const held = new Set<string>();
  const lock = {
    runExclusive: jest.fn(async (key: string, fn: () => Promise<unknown>) => {
      if (held.has(key)) return { acquired: false };
      held.add(key);
      try {
        return { acquired: true, value: await fn() };
      } finally {
        held.delete(key);
      }
    }),
  };
  const pipeline = new CrawlPipeline(
    new ClassifierService(),
    engine as never,
    { appliesTo: () => false } as never,
    engine as never,
    engine as never,
    httpClient as never,
  );
  const service = new CrawlerService(
    runRepo as never,
    new CrawlSourceReader(settingRepo as never),
    pipeline,
    new EventUpsertService(eventRepo as never, outbox as never),
    new EventNotifierService(
      eventRepo as never,
      telegram as never,
      outbox as never,
    ),
    httpClient as never,
    lock as never,
    imageStore as never,
  );
  return {
    service,
    eventRepo,
    runRepo,
    telegram,
    httpClient,
    lock,
    imageStore,
    outbox,
  };
}

const promo = (over: Partial<ParsedCrawlItem> = {}): ParsedCrawlItem => ({
  title: 'Khuyến mãi giảm giá iPhone 17 cực sốc',
  url: 'https://shop.vn/khuyen-mai/iphone-17',
  ...over,
});

const source = (urls: string[]): CrawlTarget => ({
  id: 'shop',
  name: 'Shop',
  targetUrls: urls,
});

describe('CrawlerService', () => {
  describe('notifyPendingEvents', () => {
    const pending = (): Row => ({
      id: 'e1',
      sourceName: 'Shop',
      title: 'Ưu đãi <b>lớn</b>',
      type: 'promo',
      url: 'https://shop.vn/a',
      image: null,
      eventDate: new Date('2026-11-05T05:00:00Z'),
      notifiedAt: null,
      dateUnknown: false,
    });

    it('không gán notifiedAt khi Telegram gửi lỗi, để lần sau gửi lại', async () => {
      const event = pending();
      const { service } = build({
        events: [event],
        telegram: {
          sendMessage: jest.fn(async () => ({
            ok: false,
            description: 'Bad Request',
          })),
        },
      });
      const summary = await service.notifyPendingEvents(0);
      expect(event.notifiedAt).toBeNull();
      expect(summary).toMatchObject({ sent: 0, failed: 1 });
    });

    it('không gán notifiedAt khi gọi Telegram ném lỗi mạng', async () => {
      const event = pending();
      const { service } = build({
        events: [event],
        telegram: {
          sendMessage: jest.fn(async () =>
            Promise.reject(new Error('ECONNRESET')),
          ),
        },
      });
      await service.notifyPendingEvents(0);
      expect(event.notifiedAt).toBeNull();
    });

    it('gán notifiedAt khi gửi thành công', async () => {
      const event = pending();
      const { service } = build({ events: [event] });
      await service.notifyPendingEvents(0);
      expect(event.notifiedAt).toBeInstanceOf(Date);
    });

    it('ảnh lỗi thì gửi lại dạng chữ', async () => {
      const event: Row = { ...pending(), image: 'https://cdn.vn/a.jpg' };
      const sendMessage = jest.fn(async () => ({ ok: true }));
      const { service } = build({
        events: [event],
        telegram: {
          sendPhoto: jest.fn(async () => ({ ok: false })),
          sendMessage,
        },
      });
      await service.notifyPendingEvents(0);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(event.notifiedAt).toBeInstanceOf(Date);
    });

    it('Telegram chưa cấu hình thì dừng và giữ event chờ', async () => {
      const event = pending();
      const { service } = build({
        events: [event],
        telegram: {
          sendMessage: jest.fn(async () => ({ ok: false, skipped: true })),
        },
      });
      const summary = await service.notifyPendingEvents(0);
      expect(summary.skipped).toBe(true);
      expect(event.notifiedAt).toBeNull();
    });

    it('hai lượt gửi chạy cùng lúc không gửi trùng một event', async () => {
      const event = pending();
      const sendMessage = jest.fn(async () => ({ ok: true }));
      const { service } = build({ events: [event], telegram: { sendMessage } });
      await Promise.all([
        service.notifyPendingEvents(0),
        service.notifyPendingEvents(0),
      ]);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('lượt cào không tự gửi Telegram; bài mới nằm chờ và lượt gửi định kỳ gửi đi', async () => {
      const url = 'https://shop.vn/feed';
      const sendMessage = jest.fn(async () => ({ ok: true }));
      const { service, eventRepo } = build({
        items: {
          [url]: [promo({ eventDate: new Date('2026-11-05T01:30:00Z') })],
        },
        telegram: { sendMessage },
      });
      await service.crawlTarget(source([url]));
      expect(sendMessage).not.toHaveBeenCalled();
      await service.notifyPendingEvents(0);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(eventRepo.rows[0].notifiedAt).toBeInstanceOf(Date);
    });

    it('escape HTML từ nội dung crawl và bỏ link không phải http(s)', () => {
      const msg = EventNotifierService.buildTelegramMessage({
        ...pending(),
        url: 'javascript:alert(1)',
      } as unknown as Event);
      expect(msg).toContain('Ưu đãi &lt;b&gt;lớn&lt;/b&gt;');
      expect(msg).not.toContain('javascript:');
    });
  });

  describe('crawlTarget', () => {
    it('không tìm được ngày đăng thì eventDate = null và dateUnknown = true, không dùng ngày crawl', async () => {
      const url = 'https://shop.vn/feed';
      const { service, eventRepo } = build({ items: { [url]: [promo()] } });
      const result = await service.crawlTarget(source([url]));
      expect(result.newItems).toBe(1);
      expect(eventRepo.rows[0]).toMatchObject({
        eventDate: null,
        eventTime: null,
        dateUnknown: true,
      });
    });

    it('có ngày đăng thì dateUnknown = false', async () => {
      const url = 'https://shop.vn/feed';
      const eventDate = new Date('2026-11-05T01:30:00Z');
      const { service, eventRepo } = build({
        items: { [url]: [promo({ eventDate, eventTime: '08:30' })] },
      });
      await service.crawlTarget(source([url]));
      expect(eventRepo.rows[0]).toMatchObject({
        eventDate,
        eventTime: '08:30',
        dateUnknown: false,
      });
    });

    it('quảng cáo Meta khác adArchiveID không ghi đè nhau; crawl lại không tạo trùng', async () => {
      const url = 'https://facebook.com/shop';
      const ads = [
        promo({
          url: 'https://www.facebook.com/ads/library/?id=1',
          externalId: '1',
          title: 'Khuyến mãi giảm giá đợt 1',
        }),
        promo({
          url: 'https://www.facebook.com/ads/library/?id=2',
          externalId: '2',
          title: 'Khuyến mãi giảm giá đợt 2',
        }),
      ];
      const { service, eventRepo } = build({ items: { [url]: ads } });
      await service.crawlTarget(source([url]));
      const second = await service.crawlTarget(source([url]));
      expect(eventRepo.rows.map((r) => r.externalId)).toEqual(['1', '2']);
      expect(second.newItems).toBe(0);
    });

    it('nguồn bị chặn không báo success', async () => {
      const url = 'https://shop.vn/tin-tuc';
      const { service, runRepo } = build({
        items: { [url]: new CrawlFetchError('blocked', url, 'HTTP 403') },
      });
      const result = await service.crawlTarget(source([url]));
      expect(result.status).toBe('blocked');
      expect(runRepo.rows[0]).toMatchObject({
        status: 'blocked',
        errorMessage: expect.stringContaining('HTTP 403'),
      });
    });

    it('một URL lỗi, URL khác thành công thì báo partial và vẫn lưu bài', async () => {
      const ok = 'https://shop.vn/feed';
      const bad = 'https://shop.vn/tin-tuc';
      const { service, eventRepo } = build({
        items: {
          [ok]: [promo()],
          [bad]: new CrawlFetchError('failed', bad, 'timeout'),
        },
      });
      const result = await service.crawlTarget(source([ok, bad]));
      expect(result.status).toBe('partial');
      expect(eventRepo.rows).toHaveLength(1);
    });

    it('lỗi không mong đợi trong engine cũng được báo failed', async () => {
      const url = 'https://shop.vn/feed';
      const { service } = build({ items: { [url]: new Error('boom') } });
      const result = await service.crawlTarget(source([url]));
      expect(result.status).toBe('failed');
    });
  });

  describe('crawl hai bước', () => {
    const list = 'https://shop.vn/tin-tuc';
    const articleHtml = (date: string) =>
      `<html><head><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"${date}"}</script>` +
      `<meta property="og:image" content="https://cdn.shop.vn/a.jpg"></head></html>`;
    const withDetail = (urls: string[]) => ({
      ...source([list]),
      extract: { fetchDetail: true, maxDetailPerRun: 2, detailDelayMs: 0 },
      targetUrls: [list],
      _urls: urls,
    });

    it('tải trang chi tiết của bài mới để lấy ngày đăng và ảnh', async () => {
      const url = 'https://shop.vn/tin-tuc/khuyen-mai-1';
      const { service, eventRepo } = build({
        items: { [list]: [promo({ url })] },
        detailPages: { [url]: articleHtml('2026-11-04T04:03:01+00:00') },
      });
      await service.crawlTarget(withDetail([url]));
      expect(eventRepo.rows[0]).toMatchObject({
        dateUnknown: false,
        eventTime: '11:03',
        image: 'https://cdn.shop.vn/a.jpg',
      });
    });

    it('giới hạn số trang chi tiết mỗi lần; bài còn lại lưu dateUnknown', async () => {
      const items = [1, 2, 3].map((n) =>
        promo({
          url: `https://shop.vn/tin-tuc/khuyen-mai-${n}`,
          title: `Khuyến mãi giảm giá đợt số ${n}`,
        }),
      );
      const { service, eventRepo, httpClient } = build({
        items: { [list]: items },
      });
      await service.crawlTarget(withDetail([]));
      expect(httpClient.fetchPage).toHaveBeenCalledTimes(2);
      expect(eventRepo.rows.every((r) => r.dateUnknown === true)).toBe(true);
    });

    it('lần cào sau bổ sung ngày cho bài cũ chưa rõ ngày, không tải lại bài đã có ngày', async () => {
      const url = 'https://shop.vn/tin-tuc/khuyen-mai-1';
      const old = {
        id: 'e1',
        sourceId: 'shop',
        url,
        title: 'x',
        dateUnknown: true,
        eventDate: null,
        eventTime: null,
      };
      const { service, httpClient } = build({
        events: [old],
        items: { [list]: [promo({ url })] },
        detailPages: { [url]: articleHtml('2026-11-06T00:00:00+07:00') },
      });
      await service.crawlTarget(withDetail([url]));
      expect(old.dateUnknown).toBe(false);
      expect(old.eventTime).toBeNull();
      await service.crawlTarget(withDetail([url]));
      expect(httpClient.fetchPage).toHaveBeenCalledTimes(1);
    });

    it('ưu tiên tải trang chi tiết cho bài mới trước bài cũ chưa rõ ngày', async () => {
      const oldUrls = [1, 2].map((n) => `https://shop.vn/tin-tuc/cu-${n}`);
      const newUrl = 'https://shop.vn/tin-tuc/moi-1';
      const events = oldUrls.map((url, i) => ({
        id: `old-${i}`,
        sourceId: 'shop',
        url,
        title: 'x',
        dateUnknown: true,
        eventDate: null,
      }));
      const items = [
        ...oldUrls.map((url, i) =>
          promo({ url, title: `Khuyến mãi giảm giá bài cũ ${i}` }),
        ),
        promo({ url: newUrl, title: 'Khuyến mãi giảm giá bài mới' }),
      ];
      const { service, httpClient } = build({
        events,
        items: { [list]: items },
      });
      await service.crawlTarget({
        ...source([list]),
        extract: { fetchDetail: true, maxDetailPerRun: 1, detailDelayMs: 0 },
      });
      expect(httpClient.fetchPage).toHaveBeenCalledTimes(1);
      expect(httpClient.fetchPage).toHaveBeenCalledWith(newUrl);
    });

    it('nguồn bật fetchDetail lấy ngày từ trang chi tiết, không dùng ngày đoán từ tiêu đề', async () => {
      const url = 'https://shop.vn/tin-tuc/sim-1';
      const { service, eventRepo } = build({
        items: {
          [list]: [
            promo({
              url,
              title: 'Khuyến mãi giảm giá SIM, áp dụng từ 01/11/2026',
            }),
          ],
        },
        detailPages: { [url]: articleHtml('2026-11-04T04:03:01+00:00') },
      });
      await service.crawlTarget({
        ...source([list]),
        extract: { fetchDetail: true, detailDelayMs: 0 },
      });
      expect(eventRepo.rows[0]).toMatchObject({
        eventTime: '11:03',
        dateUnknown: false,
      });
    });

    it('bỏ bài có tiêu đề khớp excludeTitlePattern của nguồn', async () => {
      const { service, eventRepo } = build({
        items: {
          [list]: [
            promo({
              url: 'https://shop.vn/tin-tuc/a-1',
              title: 'Danh sách người có ảnh hưởng hợp tác với Shop',
            }),
            promo({ url: 'https://shop.vn/tin-tuc/b-2' }),
          ],
        },
      });
      await service.crawlTarget({
        ...source([list]),
        extract: { excludeTitlePattern: 'NGƯỜI CÓ ẢNH HƯỞNG' },
      });
      expect(eventRepo.rows.map((r) => r.url)).toEqual([
        'https://shop.vn/tin-tuc/b-2',
      ]);
    });

    it('nguồn không bật fetchDetail và bài đã có ảnh thì không tải trang chi tiết', async () => {
      const { service, httpClient } = build({
        items: { [list]: [promo({ image: 'https://cdn.shop.vn/x.jpg' })] },
      });
      await service.crawlTarget(source([list]));
      expect(httpClient.fetchPage).not.toHaveBeenCalled();
    });

    it('bài mới thiếu ảnh: tải trang chi tiết lấy ảnh, nhưng không lấy ngày nếu nguồn không bật fetchDetail', async () => {
      const url = 'https://shop.vn/khuyen-mai/iphone-17';
      const { service, eventRepo } = build({
        items: { [list]: [promo({ url })] },
        detailPages: { [url]: articleHtml('2026-11-04T04:03:01+00:00') },
      });
      await service.crawlTarget(source([list]));
      expect(eventRepo.rows[0]).toMatchObject({
        image: 'https://cdn.shop.vn/a.jpg',
        dateUnknown: true,
      });
    });

    it('bài đã có trong DB thì không tải lại trang chi tiết để lấy ảnh (thay cho việc tải ảnh mỗi lần cào RSS)', async () => {
      const url = 'https://shop.vn/khuyen-mai/iphone-17';
      const old = {
        id: 'e1',
        sourceId: 'shop',
        url,
        title: 'x',
        dateUnknown: false,
        image: null,
      };
      const { service, httpClient } = build({
        events: [old],
        items: { [list]: [promo({ url })] },
      });
      await service.crawlTarget(source([list]));
      expect(httpClient.fetchPage).not.toHaveBeenCalled();
    });
  });

  describe('ghi DB theo lô', () => {
    const list = 'https://shop.vn/feed';

    it('cào lại lần hai không tạo trùng và không ghi lại bài không đổi', async () => {
      const items = [1, 2, 3].map((n) =>
        promo({
          url: `https://shop.vn/tin-tuc/km-${n}`,
          title: `Khuyến mãi giảm giá đợt ${n}`,
          image: 'https://cdn.shop.vn/a.jpg',
          eventDate: new Date('2026-11-05T01:30:00Z'),
        }),
      );
      const { service, eventRepo } = build({ items: { [list]: items } });
      const first = await service.crawlTarget(source([list]));
      expect(first.newItems).toBe(3);

      eventRepo.update.mockClear();
      eventRepo.save.mockClear();
      const second = await service.crawlTarget(source([list]));
      expect(second.newItems).toBe(0);
      expect(eventRepo.rows).toHaveLength(3);
      // Chỉ một lệnh cập nhật lastSeenAt cho cả lô, không update từng bài.
      expect(eventRepo.update).toHaveBeenCalledTimes(1);
      expect(eventRepo.save).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.anything()]),
        expect.anything(),
      );
    });

    it('chỉ update cột thay đổi', async () => {
      const url = 'https://shop.vn/tin-tuc/km-1';
      const old = {
        id: 'e1',
        sourceId: 'shop',
        url,
        title: 'Tiêu đề cũ khuyến mãi',
        type: 'promo',
        dateUnknown: false,
        image: 'https://cdn.shop.vn/a.jpg',
        externalId: null,
        eventTime: null,
        eventDate: null,
      };
      const { service, eventRepo } = build({
        events: [old],
        items: {
          [list]: [
            promo({
              url,
              title: 'Khuyến mãi giảm giá tiêu đề mới',
              image: 'https://cdn.shop.vn/a.jpg',
            }),
          ],
        },
      });
      await service.crawlTarget(source([list]));
      expect(eventRepo.update).toHaveBeenCalledWith('e1', {
        title: 'Khuyến mãi giảm giá tiêu đề mới',
      });
    });

    it('ảnh của bài đổi thì xóa trạng thái ảnh đã lưu để lưu lại', () => {
      const patch = EventUpsertService.diffExisting(
        {
          title: 'A',
          type: 'promo',
          image: 'https://cdn.shop.vn/a.jpg',
          imageStoredPath: 'x.webp',
          imageStoreStatus: 'stored',
        } as Event,
        {
          item: { title: 'A', url: 'https://shop.vn/a' },
          type: 'promo',
          externalId: null,
          image: 'https://cdn.shop.vn/b.jpg',
          dateInfo: { date: null, time: null, isExplicit: false },
        },
      );
      expect(patch).toEqual({
        image: 'https://cdn.shop.vn/b.jpg',
        imageStoredPath: null,
        imageStoredAt: null,
        imageStoreStatus: null,
      });
    });

    it('cào xong thì gọi lưu ảnh cho nguồn', async () => {
      const { service, imageStore } = build({
        items: { [list]: [promo({ url: 'https://shop.vn/tin-tuc/km-9' })] },
      });
      await service.crawlTarget(source([list]));
      expect(imageStore.storeForTarget).toHaveBeenCalledTimes(1);
    });
  });

  describe('chống chạy chồng và lượt bị kẹt', () => {
    const list = 'https://shop.vn/feed';

    it('hai lượt cào cùng nguồn chạy cùng lúc: lượt sau bị bỏ qua, không tạo trùng', async () => {
      const { service, eventRepo, runRepo } = build({
        items: { [list]: [promo()] },
      });
      const [a, b] = await Promise.all([
        service.crawlTarget(source([list])),
        service.crawlTarget(source([list])),
      ]);
      expect([a.status, b.status].sort()).toEqual(['skipped', 'success']);
      expect(eventRepo.rows).toHaveLength(1);
      expect(runRepo.rows).toHaveLength(1);
    });

    it('lượt running quá 30 phút bị chuyển thành failed', async () => {
      const now = new Date('2026-11-07T10:00:00Z');
      const { service, runRepo } = build({});
      runRepo.rows.push(
        {
          id: 'old',
          status: 'running',
          startedAt: new Date('2026-11-07T09:00:00Z'),
        },
        {
          id: 'fresh',
          status: 'running',
          startedAt: new Date('2026-11-07T09:50:00Z'),
        },
      );
      await expect(service.failStaleRuns(now)).resolves.toBe(1);
      expect(runRepo.rows.find((r) => r.id === 'old')?.status).toBe('failed');
      expect(runRepo.rows.find((r) => r.id === 'fresh')?.status).toBe(
        'running',
      );
    });
  });

  describe('resolveRunStatus', () => {
    const blocked = new CrawlFetchError('blocked', 'u', 'r');
    const failed = new CrawlFetchError('failed', 'u', 'r');
    it.each([
      [[], 2, 'success'],
      [[blocked], 2, 'partial'],
      [[blocked, blocked], 2, 'blocked'],
      [[blocked, failed], 2, 'failed'],
    ] as const)('%#', (errors, attempts, expected) => {
      expect(CrawlPipeline.resolveRunStatus([...errors], attempts)).toBe(
        expected,
      );
    });
  });
});

describe('CrawlPipeline.engineForUrl', () => {
  it.each([
    ['https://www.facebook.com/ads/library/?id=1', 'meta-ads'],
    ['https://hoanghamobile.com/tin-tuc/category/khuyen-mai/feed/', 'rss'],
    ['https://shop.vn/sitemap.xml', 'rss'],
    ['https://shop.vn/news.rss', 'rss'],
    ['https://www.thegioididong.com/tin-tuc/tin-khuyen-mai/31', 'html'],
    ['https://didongviet.vn/dchannel/khuyen-mai/', 'html'],
  ])('%s -> %s', (url, kind) => {
    expect(CrawlPipeline.engineForUrl(url)).toBe(kind);
  });
});

describe('Hàng chờ thông báo (outbox)', () => {
  const list = 'https://shop.vn/feed';
  const html = (iso: string) =>
    `<html><head><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"${iso}"}</script></head><body></body></html>`;

  it('bài mới chưa rõ ngày đăng không vào hàng chờ; có ngày thì vào', async () => {
    const { service, outbox, eventRepo } = build({
      telegram: {
        sendMessage: jest.fn(async () => ({ ok: false, skipped: true })),
      },
      items: {
        [list]: [
          promo({
            url: 'https://shop.vn/km-a',
            title: 'Khuyến mãi giảm giá máy A',
          }),
          promo({
            url: 'https://shop.vn/km-b',
            title: 'Khuyến mãi giảm giá máy B',
            eventDate: new Date('2026-11-05T05:00:00Z'),
            eventTime: '12:00',
          }),
        ],
      },
    });
    await service.crawlTarget(source([list]));
    const dated = eventRepo.rows.find((r) => r.url === 'https://shop.vn/km-b')!;
    expect(outbox.jobs.map((j) => j.eventId)).toEqual([dated.id]);
  });

  it('bài cũ chưa rõ ngày, lần cào sau tìm được ngày thì mới vào hàng chờ', async () => {
    const url = 'https://shop.vn/tin-tuc/km-c';
    const { service, outbox } = build({
      telegram: {
        sendMessage: jest.fn(async () => ({ ok: false, skipped: true })),
      },
      events: [
        {
          id: 'old',
          sourceId: 'shop',
          url,
          title: 'Khuyến mãi giảm giá máy C',
          type: 'promo',
          dateUnknown: true,
          eventDate: null,
          notifiedAt: null,
          externalId: null,
        },
      ],
      items: { [list]: [promo({ url, title: 'Khuyến mãi giảm giá máy C' })] },
      detailPages: { [url]: html('2026-11-04T04:03:01+00:00') },
    });
    expect(outbox.jobs).toHaveLength(0);
    await service.crawlTarget({
      ...source([list]),
      extract: { fetchDetail: true, detailDelayMs: 0 },
    });
    expect(outbox.jobs.map((j) => j.eventId)).toEqual(['old']);
  });

  it('gửi lỗi thì thông báo vẫn ở hàng chờ, tăng số lần thử', async () => {
    const event = {
      id: 'e1',
      title: 'A',
      sourceName: 'S',
      type: 'promo',
      url: 'https://a.vn/1',
      dateUnknown: false,
      notifiedAt: null,
    };
    const { service, outbox } = build({
      events: [event],
      telegram: {
        sendMessage: jest.fn(async () => ({
          ok: false,
          description: 'HTTP 500',
        })),
      },
    });
    await service.notifyPendingEvents(0);
    expect(outbox.jobs[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(event.notifiedAt).toBeNull();
  });
});
