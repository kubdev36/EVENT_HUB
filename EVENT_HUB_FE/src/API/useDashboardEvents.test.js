import { describe, expect, it } from 'vitest';
import { imageQueryParams } from './useDashboardEvents';

describe('imageQueryParams (thư viện ảnh lọc ở server)', () => {
  const base = { from: '2026-11-01', to: '2026-11-10' };

  it('mặc định: tất cả nguồn, có ảnh, không lọc loại và từ khóa', () => {
    expect(imageQueryParams(base)).toEqual({ ...base, hasImage: 'true', limit: 60, includeOwn: 'true' });
  });

  it('nhóm Nội bộ / Đối thủ', () => {
    expect(imageQueryParams({ ...base, segment: 'minhtuan' })).toMatchObject({ brands: 'minhtuan' });
    expect(imageQueryParams({ ...base, segment: 'minhtuan' })).not.toHaveProperty('includeOwn');
    expect(imageQueryParams({ ...base, segment: 'competitors' })).toMatchObject({ includeOwn: 'false' });
  });

  it('loại bài và từ khóa (cắt khoảng trắng, bỏ khi trống)', () => {
    expect(imageQueryParams({ ...base, type: 'promo', q: '  iphone ' })).toMatchObject({ type: 'promo', q: 'iphone' });
    expect(imageQueryParams({ ...base, q: '   ' })).not.toHaveProperty('q');
    expect(imageQueryParams({ ...base, type: 'all' })).not.toHaveProperty('type');
  });
});
