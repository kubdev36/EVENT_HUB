import { describe, expect, it } from 'vitest';
import { buildNewCrawler, cleanTarget, slugifySourceId } from './crawlerSources';

describe('slugifySourceId', () => {
  it.each([
    ['Di Động Việt', 'didongviet'],
    ['Thế giới di động', 'thegioididong'],
    ['FPT SHOP', 'fptshop'],
    ['ĐiỆn Máy Xanh 24h', 'dienmayxanh24h'],
  ])('%s -> %s', (name, id) => {
    expect(slugifySourceId(name)).toBe(id);
  });
});

describe('buildNewCrawler', () => {
  it('báo lỗi khi trùng mã hoặc tên trống', () => {
    expect(() => buildNewCrawler({ name: 'FPT Shop' }, ['fptshop'])).toThrow('Đã có nguồn');
    expect(() => buildNewCrawler({ name: '   ' }, [])).toThrow('Nhập tên');
    expect(() => buildNewCrawler({ name: '!!!' }, [])).toThrow('ít nhất một chữ');
  });

  it('tạo nguồn mới: bỏ URL trống, cắt khoảng trắng, logo mặc định', () => {
    const c = buildNewCrawler({ name: 'Viettel Store', targetUrls: [' https://a.vn/km ', ''] }, ['fptshop']);
    expect(c).toMatchObject({
      id: 'viettelstore',
      name: 'Viettel Store',
      enabled: true,
      interval: '6h',
      targetUrls: ['https://a.vn/km'],
      logo: '/img/mtm.png',
    });
  });
});

describe('cleanTarget', () => {
  it('giữ cấu hình riêng của nguồn và bỏ trường giao diện', () => {
    const t = cleanTarget({
      id: 'tgdd',
      name: 'TGDD',
      enabled: true,
      targetUrls: ['https://x.vn'],
      extract: { itemSelector: 'li' },
      minRequestIntervalMs: 0,
      storeImages: false,
      lastRun: '07/11 · thành công',
      events: [],
    });
    expect(t).toMatchObject({ extract: { itemSelector: 'li' }, minRequestIntervalMs: 0, storeImages: false });
    expect(t).not.toHaveProperty('lastRun');
    expect(t).not.toHaveProperty('events');
  });
});
