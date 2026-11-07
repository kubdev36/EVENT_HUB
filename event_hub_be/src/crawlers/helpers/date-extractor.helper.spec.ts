import { DateExtractorHelper } from './date-extractor.helper.js';

// Test chạy với TZ=UTC (xem script "test") để bắt lỗi phụ thuộc múi giờ server.
const vn = (iso: string) => new Date(`${iso}+07:00`);
const vnDay = (d: Date) => DateExtractorHelper.vnParts(d);

describe('DateExtractorHelper', () => {
  const ref = vn('2026-11-07T10:00:00');

  describe('parsePublishedDate', () => {
    it('giữ đúng thời điểm khi chuỗi có múi giờ', () => {
      const r = DateExtractorHelper.parsePublishedDate('2026-11-05T01:30:00Z');
      expect(r?.date.toISOString()).toBe('2026-11-05T01:30:00.000Z');
      expect(r?.time).toBe('08:30');
    });

    it('hiểu giờ không có múi giờ là giờ Việt Nam, không phải giờ server', () => {
      const r = DateExtractorHelper.parsePublishedDate('2026-11-05 08:30:00');
      expect(r?.date.toISOString()).toBe('2026-11-05T01:30:00.000Z');
      expect(r?.time).toBe('08:30');
    });

    it('đọc RSS pubDate', () => {
      const r = DateExtractorHelper.parsePublishedDate('Thu, 01 Oct 2026 07:15:28 +0000');
      expect(r?.date.toISOString()).toBe('2026-10-01T07:15:28.000Z');
      expect(r?.time).toBe('14:15');
    });

    it('đọc 01/10/2026 là ngày 1 tháng 10, không phải 10 tháng 1', () => {
      const r = DateExtractorHelper.parsePublishedDate('01/10/2026');
      expect(r && vnDay(r.date)).toEqual({ year: 2026, month: 10, day: 1 });
    });

    it('ngày không có giờ thì time = null, không gán giờ crawl', () => {
      const r = DateExtractorHelper.parsePublishedDate('2026-09-29', ref);
      expect(r && vnDay(r.date)).toEqual({ year: 2026, month: 9, day: 29 });
      expect(r?.time).toBeNull();
    });

    it('đọc định dạng tiếng Việt theo lịch Việt Nam', () => {
      const cases: Array<[string, { year: number; month: number; day: number }]> = [
        ['Tháng 9 29, 2026', { year: 2026, month: 9, day: 29 }],
        ['15 Tháng 10, 2026', { year: 2026, month: 10, day: 15 }],
        ['ngày 3 tháng 11 năm 2026', { year: 2026, month: 11, day: 3 }],
        ['Đăng lúc 28-10-2026', { year: 2026, month: 10, day: 28 }],
      ];
      for (const [text, expected] of cases) {
        const r = DateExtractorHelper.parsePublishedDate(text, ref);
        expect(r && vnDay(r.date)).toEqual(expected);
        expect(r?.time).toBeNull();
      }
    });

    it('"hôm qua" lùi một ngày theo lịch Việt Nam, kể cả lúc 0h30 giờ VN', () => {
      const earlyRef = vn('2026-11-07T00:30:00'); // vẫn là 06/11 theo UTC
      const r = DateExtractorHelper.parsePublishedDate('Hôm qua', earlyRef);
      expect(r && vnDay(r.date)).toEqual({ year: 2026, month: 11, day: 6 });
      expect(r?.time).toBeNull();
    });

    it('"3 giờ trước" có giờ chính xác', () => {
      const r = DateExtractorHelper.parsePublishedDate('3 giờ trước', ref);
      expect(r?.date.toISOString()).toBe(vn('2026-11-07T07:00:00').toISOString());
      expect(r?.time).toBe('07:00');
    });

    it('"2 ngày trước" chỉ biết ngày', () => {
      const r = DateExtractorHelper.parsePublishedDate('2 ngày trước', ref);
      expect(r && vnDay(r.date)).toEqual({ year: 2026, month: 11, day: 5 });
      expect(r?.time).toBeNull();
    });

    it('bỏ ngày không tồn tại và năm ngoài khoảng', () => {
      expect(DateExtractorHelper.parsePublishedDate('31/02/2026')).toBeNull();
      expect(DateExtractorHelper.parsePublishedDate('2010-01-01')).toBeNull();
      expect(DateExtractorHelper.parsePublishedDate('không có ngày')).toBeNull();
      expect(DateExtractorHelper.parsePublishedDate(null)).toBeNull();
    });
  });

  describe('parseDateFromUrl', () => {
    it('đọc ngày trong đường dẫn', () => {
      const a = DateExtractorHelper.parseDateFromUrl('https://x.vn/2026/09/29/bai-viet');
      expect(a && vnDay(a.date)).toEqual({ year: 2026, month: 9, day: 29 });
      const b = DateExtractorHelper.parseDateFromUrl('https://x.vn/khuyen-mai-29-09-2026.html');
      expect(b && vnDay(b.date)).toEqual({ year: 2026, month: 9, day: 29 });
      expect(a?.time).toBeNull();
    });

    it('không có ngày thì trả null', () => {
      expect(DateExtractorHelper.parseDateFromUrl('https://x.vn/khuyen-mai')).toBeNull();
    });
  });

  describe('parseItemEventDate', () => {
    it('không tìm được ngày thì trả date = null, time = null, không dùng ngày crawl', () => {
      const r = DateExtractorHelper.parseItemEventDate({ title: 'Ưu đãi lớn tháng này', url: 'https://x.vn/uu-dai' }, ref);
      expect(r).toEqual({ date: null, time: null, isExplicit: false });
    });

    it('ưu tiên eventDate có sẵn và giữ eventTime null nếu nguồn không cho', () => {
      const date = vn('2026-10-01T12:00:00');
      const r = DateExtractorHelper.parseItemEventDate({ title: 'x', url: 'https://x.vn', eventDate: date }, ref);
      expect(r).toEqual({ date, time: null, isExplicit: true });
    });
  });
});
