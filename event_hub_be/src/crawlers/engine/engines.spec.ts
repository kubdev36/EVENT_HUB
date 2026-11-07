import { CrawlTarget } from '../crawler.types.js';
import { CrawlerHttpClient, CrawlFetchError } from './crawler-http.client.js';
import { GenericApiEngine } from './generic-api.engine.js';
import { GenericMetaAdsEngine } from './generic-meta-ads.engine.js';
import { GenericRssEngine } from './generic-rss.engine.js';

const target: CrawlTarget = { id: 'cps', name: 'CellphoneS', targetUrls: ['https://cellphones.com.vn/sforum/khuyen-mai'] };

describe('GenericApiEngine.mapSforumPosts', () => {
  it('định dạng giờ đăng theo Asia/Ho_Chi_Minh, không theo múi giờ server (TZ=UTC)', () => {
    const [item] = GenericApiEngine.mapSforumPosts(
      [{ id: 1, title: 'Giảm giá iPhone 17 Pro Max', slug: 'giam-gia', published_at: '2026-11-05T01:30:00Z' }],
      target,
    );
    expect(item.eventTime).toBe('08:30');
    expect(item.eventDate?.toISOString()).toBe('2026-11-05T01:30:00.000Z');
  });
});

describe('GenericMetaAdsEngine.mapAds', () => {
  const ad = (id: string, text: string) => ({
    adArchiveID: id,
    pageID: 'p',
    pageName: 'Shop',
    startDate: 1793836800,
    snapshot: { body: { text }, link_url: 'https://shop.vn/landing' },
  });

  it('hai quảng cáo cùng landing page có url và externalId riêng', () => {
    const items = GenericMetaAdsEngine.mapAds([ad('111', 'Ưu đãi tháng 11 cực lớn'), [ad('222', 'Flash sale cuối tuần này')]]);
    expect(items.map((i) => i.externalId)).toEqual(['111', '222']);
    expect(new Set(items.map((i) => i.url)).size).toBe(2);
    expect(items[0].rawData?.landingUrl).toBe('https://shop.vn/landing');
  });

  it('bỏ quảng cáo không có adArchiveID', () => {
    expect(GenericMetaAdsEngine.mapAds([ad('', 'Ưu đãi tháng 11 cực lớn')])).toEqual([]);
  });
});

describe('Engine báo lỗi thay vì trả rỗng', () => {
  const blockedClient = {
    requirePage: (url: string) => Promise.reject(new CrawlFetchError('blocked', url, 'HTTP 403')),
    fetchHtml: () => Promise.resolve(null),
  } as unknown as CrawlerHttpClient;

  it('RSS bị chặn thì ném CrawlFetchError blocked', async () => {
    await expect(new GenericRssEngine(blockedClient).fetchRssOrSitemap('https://x.vn/feed')).rejects.toMatchObject({
      kind: 'blocked',
    });
  });

  it('RSS trả về HTML thì báo failed', async () => {
    const client = {
      requirePage: (url: string) => Promise.resolve({ url, html: '<html><body>trang chủ</body></html>' }),
    } as unknown as CrawlerHttpClient;
    await expect(new GenericRssEngine(client).fetchRssOrSitemap('https://x.vn/feed')).rejects.toMatchObject({
      kind: 'failed',
    });
  });

  it('Meta không xác định được Page ID thì báo failed', async () => {
    await expect(new GenericMetaAdsEngine(blockedClient).fetchActiveAds('https://facebook.com/unknownpage')).rejects.toBeInstanceOf(
      CrawlFetchError,
    );
  });
});
