import { jest } from '@jest/globals';
import { ClassifierService } from '../../classifier/classifier.service.js';
import { Event } from '../../events/entity/event.entity.js';
import { CrawlTarget, ParsedCrawlItem } from '../crawler.types.js';
import { CrawlFetchError } from '../engine/crawler-http.client.js';
import { CrawlerService } from './crawler.service.js';

type Row = Record<string, unknown>;

/** Repository giả trong bộ nhớ, đủ cho các hàm CrawlerService đang dùng. */
function memoryRepo(rows: Row[] = []) {
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && '_type' in (v as object) ? row[k] == null : row[k] === v,
    );
  return {
    rows,
    create: (data: Row) => ({ ...data }),
    save: jest.fn(async (row: Row) => {
      if (!row.id) row.id = `id-${rows.length + 1}`;
      if (!rows.includes(row)) rows.push(row);
      return row;
    }),
    findOne: async ({ where }: { where: Row | Row[] }) =>
      rows.find((r) => (Array.isArray(where) ? where : [where]).some((w) => matches(r, w))) ?? null,
    find: async ({ where }: { where?: Row } = {}) => rows.filter((r) => !where || matches(r, where)),
  };
}

function build(opts: {
  items?: Record<string, ParsedCrawlItem[] | Error>;
  telegram?: { sendMessage?: jest.Mock; sendPhoto?: jest.Mock };
  events?: Row[];
}) {
  const eventRepo = memoryRepo(opts.events);
  const runRepo = memoryRepo();
  const settingRepo = { findOne: async () => null };
  const fromMap = (url: string) => {
    const v = opts.items?.[url];
    return v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? []);
  };
  const engine = { fetchRssOrSitemap: fromMap, fetchHtmlItems: fromMap, fetchActiveAds: fromMap };
  const telegram = {
    sendMessage: opts.telegram?.sendMessage ?? jest.fn(async () => ({ ok: true })),
    sendPhoto: opts.telegram?.sendPhoto ?? jest.fn(async () => ({ ok: true })),
  };
  const service = new CrawlerService(
    eventRepo as never,
    runRepo as never,
    settingRepo as never,
    new ClassifierService(),
    telegram as never,
    engine as never,
    { appliesTo: () => false } as never,
    engine as never,
    engine as never,
    { requestCount: 0 } as never,
  );
  service.urlDelayMs = 0;
  return { service, eventRepo, runRepo, telegram };
}

const promo = (over: Partial<ParsedCrawlItem> = {}): ParsedCrawlItem => ({
  title: 'Khuyến mãi giảm giá iPhone 17 cực sốc',
  url: 'https://shop.vn/khuyen-mai/iphone-17',
  ...over,
});

const source = (urls: string[]): CrawlTarget => ({ id: 'shop', name: 'Shop', targetUrls: urls });

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
        telegram: { sendMessage: jest.fn(async () => ({ ok: false, description: 'Bad Request' })) },
      });
      const summary = await service.notifyPendingEvents(0);
      expect(event.notifiedAt).toBeNull();
      expect(summary).toMatchObject({ sent: 0, failed: 1 });
    });

    it('không gán notifiedAt khi gọi Telegram ném lỗi mạng', async () => {
      const event = pending();
      const { service } = build({
        events: [event],
        telegram: { sendMessage: jest.fn(async () => Promise.reject(new Error('ECONNRESET'))) },
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
      const event = { ...pending(), image: 'https://cdn.vn/a.jpg' };
      const sendMessage = jest.fn(async () => ({ ok: true }));
      const { service } = build({
        events: [event],
        telegram: { sendPhoto: jest.fn(async () => ({ ok: false })), sendMessage },
      });
      await service.notifyPendingEvents(0);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(event.notifiedAt).toBeInstanceOf(Date);
    });

    it('Telegram chưa cấu hình thì dừng và giữ event chờ', async () => {
      const event = pending();
      const { service } = build({
        events: [event],
        telegram: { sendMessage: jest.fn(async () => ({ ok: false, skipped: true })) },
      });
      const summary = await service.notifyPendingEvents(0);
      expect(summary.skipped).toBe(true);
      expect(event.notifiedAt).toBeNull();
    });

    it('hai lượt gửi chạy cùng lúc không gửi trùng một event', async () => {
      const event = pending();
      const sendMessage = jest.fn(async () => ({ ok: true }));
      const { service } = build({ events: [event], telegram: { sendMessage } });
      await Promise.all([service.notifyPendingEvents(0), service.notifyPendingEvents(0)]);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('cào xong một nguồn thì gửi Telegram ngay cho bài mới', async () => {
      const url = 'https://shop.vn/feed';
      const sendMessage = jest.fn(async () => ({ ok: true }));
      const { service, eventRepo } = build({
        items: { [url]: [promo({ eventDate: new Date('2026-11-05T01:30:00Z') })] },
        telegram: { sendMessage },
      });
      await service.crawlSource(source([url]));
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(eventRepo.rows[0].notifiedAt).toBeInstanceOf(Date);
    });

    it('escape HTML từ nội dung crawl và bỏ link không phải http(s)', () => {
      const msg = CrawlerService.buildTelegramMessage({ ...pending(), url: 'javascript:alert(1)' } as unknown as Event);
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
      expect(eventRepo.rows[0]).toMatchObject({ eventDate: null, eventTime: null, dateUnknown: true });
    });

    it('có ngày đăng thì dateUnknown = false', async () => {
      const url = 'https://shop.vn/feed';
      const eventDate = new Date('2026-11-05T01:30:00Z');
      const { service, eventRepo } = build({ items: { [url]: [promo({ eventDate, eventTime: '08:30' })] } });
      await service.crawlTarget(source([url]));
      expect(eventRepo.rows[0]).toMatchObject({ eventDate, eventTime: '08:30', dateUnknown: false });
    });

    it('quảng cáo Meta khác adArchiveID không ghi đè nhau; crawl lại không tạo trùng', async () => {
      const url = 'https://facebook.com/shop';
      const ads = [
        promo({ url: 'https://www.facebook.com/ads/library/?id=1', externalId: '1', title: 'Khuyến mãi giảm giá đợt 1' }),
        promo({ url: 'https://www.facebook.com/ads/library/?id=2', externalId: '2', title: 'Khuyến mãi giảm giá đợt 2' }),
      ];
      const { service, eventRepo } = build({ items: { [url]: ads } });
      await service.crawlTarget(source([url]));
      const second = await service.crawlTarget(source([url]));
      expect(eventRepo.rows.map((r) => r.externalId)).toEqual(['1', '2']);
      expect(second.newItems).toBe(0);
    });

    it('nguồn bị chặn không báo success', async () => {
      const url = 'https://shop.vn/tin-tuc';
      const { service, runRepo } = build({ items: { [url]: new CrawlFetchError('blocked', url, 'HTTP 403') } });
      const result = await service.crawlTarget(source([url]));
      expect(result.status).toBe('blocked');
      expect(runRepo.rows[0]).toMatchObject({ status: 'blocked', errorMessage: expect.stringContaining('HTTP 403') });
    });

    it('một URL lỗi, URL khác thành công thì báo partial và vẫn lưu bài', async () => {
      const ok = 'https://shop.vn/feed';
      const bad = 'https://shop.vn/tin-tuc';
      const { service, eventRepo } = build({
        items: { [ok]: [promo()], [bad]: new CrawlFetchError('failed', bad, 'timeout') },
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

  describe('resolveRunStatus', () => {
    const blocked = new CrawlFetchError('blocked', 'u', 'r');
    const failed = new CrawlFetchError('failed', 'u', 'r');
    it.each([
      [[], 2, 'success'],
      [[blocked], 2, 'partial'],
      [[blocked, blocked], 2, 'blocked'],
      [[blocked, failed], 2, 'failed'],
    ] as const)('%#', (errors, attempts, expected) => {
      expect(CrawlerService.resolveRunStatus([...errors], attempts)).toBe(expected);
    });
  });
});
