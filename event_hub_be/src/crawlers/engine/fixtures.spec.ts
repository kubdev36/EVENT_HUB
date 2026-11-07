import { readFileSync } from 'fs';
import { join } from 'path';
import { ExtractConfig } from '../crawler.types.js';
import { ArticleDetailHelper } from '../helpers/article-detail.helper.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { CrawlerHttpClient } from './crawler-http.client.js';
import { GenericApiEngine } from './generic-api.engine.js';
import { GenericHtmlEngine } from './generic-html.engine.js';
import { GenericRssEngine } from './generic-rss.engine.js';

// Bộ mẫu: trang thật tải ngày 07/11/2026, lưu trong test/fixtures/crawl (xem docs/crawl-survey.md).
const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'crawl', name), 'utf8');

/** Cấu hình giống cấu hình lưu trong cài đặt nguồn (docs/crawl-survey.md). */
const TGDD: ExtractConfig = {
  itemSelector: '.leftcate ul.newslist > li',
  titleSelector: 'h3',
  dateSelector: '.timepost',
  articleUrlPattern: '^/tin-tuc/[a-z0-9-]+-[0-9]+$',
  fetchDetail: true,
};
/** Thời điểm tải bộ mẫu, dùng làm mốc cho ngày tương đối "N ngày trước". */
const FIXTURE_TIME = new Date('2026-11-07T10:40:00+07:00');
const FPT: ExtractConfig = {
  articleUrlPattern:
    '^/tin-tuc/(tin-khuyen-mai|tin-moi|danh-gia)/[a-z0-9-]+-[0-9]+$',
  fetchDetail: true,
};

describe('Bộ mẫu Thế giới di động', () => {
  const items = GenericHtmlEngine.extractConfigured(
    fixture('tgdd-list-khuyen-mai.html'),
    'https://www.thegioididong.com/tin-tuc/tin-khuyen-mai/31',
    TGDD,
    FIXTURE_TIME,
  );

  it('lấy được danh sách bài khuyến mãi, không còn chỉ 1 bài', () => {
    expect(items.length).toBeGreaterThanOrEqual(12);
  });

  it('đúng là bài khuyến mãi, không phải tin công nghệ ở cột bên', () => {
    const promoWords =
      /giảm|ưu đãi|khuyến mãi|sale|tặng|hoàn tiền|trả góp|trả chậm|quà|voucher|thanh toán/i;
    const promo = items.filter((i) => promoWords.test(i.title));
    expect(promo.length).toBeGreaterThanOrEqual(items.length * 0.8);
  });

  it('lấy ngày đăng từ trang danh sách theo lịch Việt Nam', () => {
    const dated = items.filter((i) => i.eventDate);
    // 3 bài ở khối "mới nhất" dạng rút gọn không có ngày, ảnh: lấy từ trang chi tiết.
    expect(dated.length).toBeGreaterThanOrEqual(11);
    const tincard = items.find((i) =>
      i.title.startsWith('Mở thẻ tín dụng số TINCard'),
    );
    expect(
      tincard?.eventDate && DateExtractorHelper.vnParts(tincard.eventDate),
    ).toEqual({
      year: 2026,
      month: 11,
      day: 2,
    });
  });

  it('mọi bài đúng mẫu URL bài viết, cùng domain, có tiêu đề', () => {
    for (const item of items) {
      const u = new URL(item.url);
      expect(u.hostname).toBe('www.thegioididong.com');
      expect(u.pathname).toMatch(/^\/tin-tuc\/[a-z0-9-]+-[0-9]+$/);
      expect(item.title.length).toBeGreaterThanOrEqual(8);
    }
    expect(new Set(items.map((i) => i.url)).size).toBe(items.length);
  });

  it('ảnh lấy từ data-original, không lấy ảnh chờ 1x1 trong src', () => {
    const withImage = items.filter((i) => i.image);
    expect(withImage.length).toBeGreaterThanOrEqual(11);
    for (const i of withImage)
      expect(i.image).toMatch(/^https:\/\/cdnv2\.tgdd\.vn\//);
  });

  it('giải mã entity HTML trong tiêu đề', () => {
    for (const item of items) expect(item.title).not.toMatch(/&#\d+;|&amp;/);
  });

  it('trang chi tiết cho ngày đăng theo lịch Việt Nam, không có giờ', () => {
    const d = ArticleDetailHelper.parse(
      fixture('tgdd-article.html'),
      'https://www.thegioididong.com/tin-tuc/mua-tra-cham-qua-mwg-paylater-1603032',
    );
    expect(
      d.published && DateExtractorHelper.vnParts(d.published.date),
    ).toEqual({
      year: 2026,
      month: 11,
      day: 6,
    });
    expect(d.published?.time).toBeNull();
    expect(d.image).toMatch(/^https:\/\/cdnv2\.tgdd\.vn\//);
  });
});

describe('Bộ mẫu FPT Shop', () => {
  const items = GenericHtmlEngine.extractConfigured(
    fixture('fptshop-list-khuyen-mai.html'),
    'https://fptshop.com.vn/tin-tuc/tin-khuyen-mai',
    FPT,
  );

  it('chỉ lấy bài thuộc chuyên mục đang theo dõi, bỏ chuyên mục khác', () => {
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) {
      expect(new URL(item.url).pathname).toMatch(
        /^\/tin-tuc\/(tin-khuyen-mai|tin-moi|danh-gia)\//,
      );
    }
    expect(items.some((i) => i.url.includes('/for-gamers/'))).toBe(false);
  });

  it('gộp link ảnh và link tiêu đề của cùng một bài', () => {
    expect(new Set(items.map((i) => i.url)).size).toBe(items.length);
    const sunhouse = items.find((i) => i.url.endsWith('-216193'));
    expect(sunhouse?.title).toContain('SUNHOUSE');
    expect(sunhouse?.image).toMatch(/^https:\/\/cdn2\.fptshop\.com\.vn\//);
  });

  it('trang chi tiết cho ngày giờ đăng chính xác', () => {
    const d = ArticleDetailHelper.parse(
      fixture('fptshop-article.html'),
      'https://fptshop.com.vn/tin-tuc/tin-khuyen-mai/don-tet-khoe-rinh-qua-to-cung-sunhouse-tai-fpt-shop-216193',
    );
    expect(d.published?.date.toISOString()).toBe('2026-11-04T04:03:01.000Z');
    expect(d.published?.time).toBe('11:03');
  });
});

describe('Bộ mẫu Hoàng Hà (RSS chuyên mục)', () => {
  it('đọc đủ 10 bài, có ngày đăng', async () => {
    const xml = fixture('hoangha-feed-khuyen-mai.xml');
    const client = {
      requirePage: async (url: string) => ({ url, html: xml }),
      fetchHtml: async () => null,
    } as unknown as CrawlerHttpClient;
    const items = await new GenericRssEngine(client).fetchRssOrSitemap(
      'https://hoanghamobile.com/tin-tuc/category/khuyen-mai/feed/',
    );
    expect(items).toHaveLength(10);
    for (const item of items) {
      expect(item.url).toMatch(/^https:\/\/hoanghamobile\.com\/tin-tuc\//);
      expect(item.eventDate).toBeInstanceOf(Date);
    }
  });
});

describe('Cấu hình không khớp', () => {
  it('selector không khớp bài nào thì báo lỗi, không báo thành công', async () => {
    const client = {
      requirePage: async (url: string) => ({
        url,
        html: '<html><body><p>đổi giao diện</p></body></html>',
      }),
    } as unknown as CrawlerHttpClient;
    await expect(
      new GenericHtmlEngine(client).fetchHtmlItems(
        'https://www.thegioididong.com/tin-tuc/tin-khuyen-mai/',
        TGDD,
      ),
    ).rejects.toMatchObject({ kind: 'failed' });
  });

  it('API không có cấu hình thì không chạy', () => {
    const engine = new GenericApiEngine({} as CrawlerHttpClient);
    expect(
      engine.appliesTo({
        id: 'cps',
        name: 'C',
        targetUrls: ['https://cellphones.com.vn/sforum'],
      }),
    ).toBe(false);
  });
});
