import { describe, expect, it } from 'vitest';
import { sourceProgress, summarizeProgress } from './crawlProgressState';

const since = '2026-11-10T01:13:30Z';

describe('sourceProgress', () => {
  it('đang cào (kể cả bắt đầu trước lần bấm)', () => {
    expect(sourceProgress(since, { status: 'running', startedAt: '2026-11-10T01:13:00Z' }).state).toBe('running');
  });

  it('lượt cào xong trước lần bấm thì chưa tính: Chờ tới lượt', () => {
    expect(sourceProgress(since, { status: 'success', startedAt: '2026-11-10T01:11:00Z', newItems: 21 }).state).toBe('waiting');
  });

  it('lượt cào bắt đầu sau lần bấm và xong: Xong kèm số bài mới', () => {
    expect(sourceProgress(since, { status: 'success', startedAt: '2026-11-10T01:14:00Z', newItems: 3 })).toEqual({
      state: 'done',
      newItems: 3,
      partial: false,
    });
    expect(sourceProgress(since, { status: 'partial', startedAt: '2026-11-10T01:14:00Z', newItems: 1 }).partial).toBe(true);
  });

  it('bị chặn hoặc lỗi', () => {
    expect(sourceProgress(since, { status: 'blocked', startedAt: '2026-11-10T01:14:00Z' })).toMatchObject({ state: 'error', blocked: true });
    expect(sourceProgress(since, { status: 'failed', startedAt: '2026-11-10T01:14:00Z', errorMessage: 'HTTP 500' })).toMatchObject({
      state: 'error',
      blocked: false,
      message: 'HTTP 500',
    });
  });

  it('nguồn chưa từng cào: Chờ tới lượt', () => {
    expect(sourceProgress(since, undefined).state).toBe('waiting');
  });
});

describe('summarizeProgress', () => {
  it('đếm số đã xong, số bài mới và số lỗi', () => {
    const done = { state: 'done', newItems: 3 };
    const err = { state: 'error' };
    expect(summarizeProgress([{ progress: done }, { progress: err }, { progress: { state: 'waiting' } }])).toMatchObject({
      total: 3,
      finished: 2,
      newItems: 3,
      errors: 1,
      waiting: 1,
      allDone: false,
    });
    expect(summarizeProgress([{ progress: done }, { progress: err }]).allDone).toBe(true);
    expect(summarizeProgress([]).allDone).toBe(false);
  });
});
