import { DataSource } from 'typeorm';
import { CrawlerRun } from '../crawlers/entity/crawler-run.entity.js';
import { DateExtractorHelper } from '../crawlers/helpers/date-extractor.helper.js';
import { Event } from '../events/entity/event.entity.js';
import { migrations } from '../migrations/index.js';
import { Setting } from '../settings/entity/setting.entity.js';
import { User } from '../users/entity/user.entity.js';
import { DashboardService, ResolvedFilter } from './dashboard.service.js';

/**
 * Test trên Postgres thật (logic nằm trong SQL). Chỉ chạy khi có DASHBOARD_TEST_DB, ví dụ:
 *   DASHBOARD_TEST_DB=postgres://postgres:test@127.0.0.1:15499/event_hub_test npm test
 * Không bao giờ trỏ vào DB thật: test xóa sạch bảng events.
 */
const url = process.env.DASHBOARD_TEST_DB;
const d = url ? describe : describe.skip;

const vn = (y: number, m: number, day: number, h = 12, min = 0) =>
  DateExtractorHelper.vnDate(y, m, day, h, min);
let n = 0;
const ev = (over: Partial<Event>): Partial<Event> => {
  n += 1;
  return {
    sourceId: 'cps',
    sourceName: 'CellphoneS',
    origin: 'crawler',
    sourceUrl: 'https://x.vn',
    title: `Bài ${n}`,
    url: `https://x.vn/bai-${n}`,
    type: 'promo',
    contentHash: `h${n}`,
    dateUnknown: false,
    eventTime: '12:00',
    ...over,
  };
};

d('DashboardService (Postgres)', () => {
  let ds: DataSource;
  let service: DashboardService;
  let allowed: string[] | null = null;

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      url,
      entities: [User, Event, CrawlerRun, Setting],
      migrations,
      synchronize: false,
    });
    await ds.initialize();
    await ds.runMigrations();
    const fakeEvents = { getAllowedTypes: async () => allowed };
    service = new DashboardService(
      ds.getRepository(Event),
      ds.getRepository(CrawlerRun),
      ds.getRepository(Setting),
      fakeEvents as never,
    );
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    allowed = null;
    await ds.query('TRUNCATE events, crawler_runs, settings');
  });
  const insert = (rows: Partial<Event>[]) =>
    ds.getRepository(Event).save(rows as Event[], { chunk: 500 });
  const filter = (
    from: string,
    to: string,
    extra: Partial<ResolvedFilter> = {},
  ) =>
    service
      .resolveFilter({ from, to }, undefined)
      .then((f) => ({ ...f, allowed, ...extra }));

  it('nhân viên phòng ban thấy đủ bài khuyến mãi dù có hàng nghìn bài loại khác mới hơn (lỗi giới hạn 5.000 dòng)', async () => {
    await insert(
      Array.from({ length: 100 }, (_, i) =>
        ev({ type: 'promo', eventDate: vn(2026, 10, 1 + (i % 20)) }),
      ),
    );
    await insert(
      Array.from({ length: 6000 }, (_, i) =>
        ev({ type: 'other', eventDate: vn(2026, 11, 1 + (i % 6)) }),
      ),
    );
    allowed = ['promo', 'sale'];
    const s = await service.summary(await filter('2026-10-01', '2026-11-07'));
    expect(s.total).toBe(100);
    const list = await service.list(
      await filter('2026-10-01', '2026-11-07'),
      100,
    );
    expect(list.items).toHaveLength(100);
    expect(list.items.every((i) => i.type === 'promo')).toBe(true);
  });

  it('không có quyền xem loại nào thì không thấy gì', async () => {
    await insert([ev({ eventDate: vn(2026, 11, 5) })]);
    allowed = [];
    expect(
      (await service.summary(await filter('2026-11-01', '2026-11-07'))).total,
    ).toBe(0);
  });

  it('đếm theo ngày giờ Việt Nam: 23:30 thuộc ngày hôm đó, 00:30 thuộc ngày hôm sau', async () => {
    await insert([
      ev({ eventDate: vn(2026, 11, 6, 23, 30) }),
      ev({ eventDate: vn(2026, 11, 7, 0, 30) }),
    ]);
    const t = await service.timeseries(
      await filter('2026-11-06', '2026-11-07'),
    );
    expect(t.days).toEqual(['2026-11-06', '2026-11-07']);
    expect(t.series[0].values).toEqual([1, 1]);
  });

  it('khoảng ngày tính cả hai đầu theo giờ Việt Nam, ngày không có bài trả 0', async () => {
    await insert([
      ev({ eventDate: vn(2026, 10, 31, 23, 59) }),
      ev({ eventDate: vn(2026, 11, 1, 0, 0) }),
      ev({ eventDate: vn(2026, 11, 3, 23, 59) }),
      ev({ eventDate: vn(2026, 11, 4, 0, 0) }),
    ]);
    const t = await service.timeseries(
      await filter('2026-11-01', '2026-11-03'),
    );
    expect(t.series[0].values).toEqual([1, 0, 1]);
  });

  it('bỏ bài chưa rõ ngày và nguồn nội bộ minhtuan', async () => {
    await insert([
      ev({ eventDate: vn(2026, 11, 5) }),
      ev({ eventDate: null, dateUnknown: true }),
      ev({ sourceId: 'minhtuan', eventDate: vn(2026, 11, 5) }),
    ]);
    expect(
      (await service.summary(await filter('2026-11-01', '2026-11-07'))).total,
    ).toBe(1);
  });

  it('so với kỳ trước cùng độ dài', async () => {
    await insert([
      ev({ eventDate: vn(2026, 11, 5) }),
      ev({ eventDate: vn(2026, 10, 30) }),
      ev({ eventDate: vn(2026, 10, 31) }),
    ]);
    const s = await service.summary(await filter('2026-11-01', '2026-11-07'));
    expect([s.total, s.previousTotal]).toEqual([1, 2]);
  });

  it('khung giờ đăng theo giờ Việt Nam; bài không có giờ không tính', async () => {
    // 07/11/2026 là thứ Bảy (ISO 6)
    await insert([
      ev({ eventDate: vn(2026, 11, 7, 19, 15) }),
      ev({ eventDate: vn(2026, 11, 7, 12), eventTime: null }),
    ]);
    const b = await service.breakdown(
      await filter('2026-11-01', '2026-11-07'),
      'weekday-hour',
    );
    expect(b.rows).toEqual([{ weekday: 6, hour: 19, count: 1 }]);
  });

  it('phân trang bằng con trỏ không trùng, không sót, kể cả nhiều bài cùng thời điểm', async () => {
    const same = vn(2026, 11, 5, 9);
    await insert(
      Array.from({ length: 25 }, (_, i) =>
        ev({ eventDate: i < 10 ? same : vn(2026, 11, 1 + (i % 6), i % 24) }),
      ),
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(
        await filter('2026-11-01', '2026-11-07'),
        7,
        cursor,
      );
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it('danh sách không trả link không phải http(s)', async () => {
    await insert([
      ev({
        eventDate: vn(2026, 11, 5),
        url: 'javascript:alert(1)',
        image: 'data:image/png;base64,xx',
      }),
    ]);
    const list = await service.list(await filter('2026-11-01', '2026-11-07'));
    expect(list.items[0]).toMatchObject({ url: null, image: null });
  });

  it('includeOwn tính cả bài nội bộ; hasImage chỉ lấy bài có ảnh http(s)', async () => {
    await insert([
      ev({ eventDate: vn(2026, 11, 5), image: 'https://cdn.x.vn/a.jpg' }),
      ev({ eventDate: vn(2026, 11, 5), image: null }),
      ev({
        sourceId: 'minhtuan',
        origin: 'manual',
        eventDate: vn(2026, 11, 5),
        image: 'https://cdn.x.vn/b.jpg',
      }),
    ]);
    expect(
      (await service.list(await filter('2026-11-01', '2026-11-07'))).items,
    ).toHaveLength(2);
    const own = await service.list(
      await filter('2026-11-01', '2026-11-07', { includeOwn: true }),
    );
    expect(own.items).toHaveLength(3);
    expect(own.items.find((i) => i.sourceId === 'minhtuan')?.origin).toBe(
      'manual',
    );
    const img = await service.list(
      await filter('2026-11-01', '2026-11-07', {
        includeOwn: true,
        hasImage: true,
      }),
    );
    expect(img.items).toHaveLength(2);
  });

  it('tình trạng nguồn lấy lần cào gần nhất', async () => {
    await ds.getRepository(Setting).save({
      key: 'crawler_sources',
      value: { targets: [{ id: 'cps', name: 'CellphoneS' }] },
    });
    await ds.getRepository(CrawlerRun).save([
      {
        sourceId: 'cps',
        sourceName: 'C',
        status: 'failed',
        startedAt: vn(2026, 11, 6),
      },
      {
        sourceId: 'cps',
        sourceName: 'C',
        status: 'success',
        startedAt: vn(2026, 11, 7),
        itemsFound: 180,
      },
    ]);
    const s = await service.summary(await filter('2026-11-01', '2026-11-07'));
    expect(s.sources).toEqual([
      expect.objectContaining({
        sourceId: 'cps',
        status: 'success',
        itemsFound: 180,
      }),
    ]);
  });
});
