import { CrawlerHttpClient } from '../engine/crawler-http.client.js';
import {
  DEFAULT_INTERVAL_MS,
  isDue,
  mapWithConcurrency,
  parseIntervalMs,
} from './schedule.helper.js';

const MIN = 60_000;

describe('parseIntervalMs', () => {
  it.each([
    ['6h', 360 * MIN],
    ['1h', 60 * MIN],
    ['15p', 15 * MIN],
    ['30m', 30 * MIN],
    ['30 phút', 30 * MIN],
    ['1d', 24 * 60 * MIN],
    ['2 ngày', 48 * 60 * MIN],
  ])('%s', (value, expected) => {
    expect(parseIntervalMs(value)).toBe(expected);
  });

  it('giá trị lạ hoặc trống dùng mặc định 6h', () => {
    expect(parseIntervalMs('abc')).toBe(DEFAULT_INTERVAL_MS);
    expect(parseIntervalMs(undefined)).toBe(DEFAULT_INTERVAL_MS);
  });

  it('không cho cào dày hơn 15 phút', () => {
    expect(parseIntervalMs('1p')).toBe(15 * MIN);
  });
});

describe('isDue', () => {
  const now = new Date('2026-11-07T12:00:00Z');
  it('chưa cào lần nào thì đến hạn', () => {
    expect(isDue('6h', null, now)).toBe(true);
  });
  it('mới cào 2 tiếng trước, interval 6h: chưa đến hạn', () => {
    expect(isDue('6h', new Date('2026-11-07T10:00:00Z'), now)).toBe(false);
  });
  it('đã qua 6 tiếng: đến hạn', () => {
    expect(isDue('6h', new Date('2026-11-07T06:00:00Z'), now)).toBe(true);
  });
  it('interval 15p với cron 15 phút: lần trước bắt đầu muộn vài giây vẫn đến hạn', () => {
    expect(isDue('15p', new Date('2026-11-07T11:45:05Z'), now)).toBe(true);
  });
});

describe('mapWithConcurrency', () => {
  it('không chạy quá giới hạn cùng lúc và giữ thứ tự kết quả', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (n) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return n * 10;
      },
    );
    expect(peak).toBe(2);
    expect(result).toEqual([10, 20, 30, 40, 50, 60]);
  });
});

describe('Giãn cách theo domain', () => {
  it('request tới cùng domain cách nhau ít nhất khoảng đã cấu hình, domain khác không phải chờ', async () => {
    const client = new CrawlerHttpClient();
    client.setHostInterval('slow.vn', 80);
    const times: Record<string, number[]> = { slow: [], fast: [] };
    const start = Date.now();
    await Promise.all([
      ...[1, 2, 3].map(async () => {
        await client.waitForSlot('https://www.slow.vn/a');
        times.slow.push(Date.now() - start);
      }),
      (async () => {
        await client.waitForSlot('https://fast.vn/a');
        times.fast.push(Date.now() - start);
      })(),
    ]);
    times.slow.sort((a, b) => a - b);
    expect(times.slow[1] - times.slow[0]).toBeGreaterThanOrEqual(75);
    expect(times.slow[2] - times.slow[1]).toBeGreaterThanOrEqual(75);
    expect(times.fast[0]).toBeLessThan(50);
    expect(client.requestCountFor(['slow.vn'])).toBe(3);
    expect(client.requestCountFor(['https://fast.vn/x'])).toBe(1);
  });
});
