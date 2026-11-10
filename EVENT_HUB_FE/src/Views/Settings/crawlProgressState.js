/**
 * Trạng thái của một nguồn trong lần bấm cào, suy ra từ lượt cào gần nhất (crawler_runs):
 * - running: đang cào;
 * - done / error: lượt cào bắt đầu sau thời điểm xếp hàng (theo giờ server) đã kết thúc;
 * - waiting: chưa có lượt cào nào bắt đầu sau lần bấm (đang chờ tới lượt).
 */
export function sourceProgress(since, run) {
  if (run?.status === 'running') return { state: 'running' };
  const started = run?.startedAt ? Date.parse(run.startedAt) : NaN;
  if (!run || Number.isNaN(started) || started < Date.parse(since)) return { state: 'waiting' };
  if (run.status === 'success' || run.status === 'partial')
    return { state: 'done', newItems: run.newItems ?? 0, partial: run.status === 'partial' };
  return { state: 'error', blocked: run.status === 'blocked', message: run.errorMessage || '' };
}

/** Tổng hợp cho phần đầu bảng. */
export function summarizeProgress(items) {
  const count = (s) => items.filter((i) => i.progress.state === s).length;
  const finished = count('done') + count('error');
  return {
    total: items.length,
    finished,
    errors: count('error'),
    waiting: count('waiting'),
    newItems: items.reduce((n, i) => n + (i.progress.newItems ?? 0), 0),
    allDone: items.length > 0 && finished === items.length,
  };
}
