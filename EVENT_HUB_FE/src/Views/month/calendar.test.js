import { describe, expect, it } from 'vitest';
import { buildCalendarDays } from './calendar';

describe('buildCalendarDays', () => {
  it('luôn có 42 ô, bắt đầu Chủ nhật', () => {
    const days = buildCalendarDays(2026, 10);
    expect(days).toHaveLength(42);
    expect(days[0]).toEqual({ day: 1, dateStr: '2026-11-01', current: true });
    expect(days.filter((d) => d.current)).toHaveLength(30);
  });

  it('tháng 1: ô của tháng 12 năm trước có ngày đúng (không còn tháng 00)', () => {
    const days = buildCalendarDays(2027, 0);
    expect(days[0]).toEqual({ day: 27, dateStr: '2026-12-27', current: false });
    expect(days.find((d) => d.current).dateStr).toBe('2027-01-01');
  });

  it('tháng 12: ô của tháng 1 năm sau có ngày đúng (không còn tháng 13)', () => {
    const days = buildCalendarDays(2026, 11);
    expect(days[41]).toEqual({ day: 9, dateStr: '2027-01-09', current: false });
    for (const d of days) expect(d.dateStr).toMatch(/^\d{4}-(0[1-9]|1[0-2])-\d\d$/);
  });
});
