const MINUTE_MS = 60_000;
export const DEFAULT_INTERVAL_MS = 6 * 60 * MINUTE_MS;
/** Không cào một nguồn dày hơn mức này, kể cả khi cấu hình nhỏ hơn. */
export const MIN_INTERVAL_MS = 15 * MINUTE_MS;

/**
 * Đọc interval của nguồn: "15p"/"15m"/"15 phút", "6h"/"6 giờ", "1d"/"1 ngày".
 * Không đọc được thì dùng mặc định 6h.
 */
export function parseIntervalMs(value: string | null | undefined): number {
  const m = (value || '')
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*(p|m|phút|phut|min|h|giờ|gio|d|ngày|ngay)?$/);
  if (!m) return DEFAULT_INTERVAL_MS;
  const n = parseInt(m[1], 10);
  if (!n) return DEFAULT_INTERVAL_MS;
  const unit = m[2] || 'h';
  const ms = /^(p|m|phút|phut|min)$/.test(unit)
    ? n * MINUTE_MS
    : /^(d|ngày|ngay)$/.test(unit)
      ? n * 24 * 60 * MINUTE_MS
      : n * 60 * MINUTE_MS;
  return Math.max(ms, MIN_INTERVAL_MS);
}

/** Nguồn đến hạn khi chưa từng cào, hoặc lần cào gần nhất đã cách ít nhất interval. */
export function isDue(
  interval: string | null | undefined,
  lastStartedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastStartedAt) return true;
  // Trừ 1 phút dung sai: cron chạy mỗi 15 phút, lần trước có thể bắt đầu muộn vài giây.
  const elapsed = now.getTime() - new Date(lastStartedAt).getTime();
  return elapsed >= parseIntervalMs(interval) - MINUTE_MS;
}

/** Chạy các tác vụ với tối đa `limit` tác vụ cùng lúc, giữ thứ tự kết quả. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
