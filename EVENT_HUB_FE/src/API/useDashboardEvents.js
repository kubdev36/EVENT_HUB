import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { API_URL, dashboardApi } from './API';

/** Ảnh hiển thị của bài: ưu tiên ảnh thu nhỏ đã lưu trên máy chủ, không có thì dùng link gốc. */
export function eventImage(e) {
  if (e?.imageLocal && e.imageLocal.startsWith('/images/')) return `${API_URL}${e.imageLocal}`;
  return e?.image || '';
}

/** Logo mặc định theo id/tên nguồn khi cấu hình chưa có logo. */
export function fallbackLogo(id = '', name = '') {
  const s = `${id} ${name}`.toLowerCase();
  if (s.includes('minhtuan') || s.includes('minh tuấn') || s.includes('minh tuan')) return '/img/mtm.jpg';
  if (s.includes('cellphones')) return '/img/cellphones.png';
  if (s.includes('hoangha') || s.includes('hoàng hà') || s.includes('hoang ha')) return '/img/hoangha.jpg';
  if (s.includes('fpt')) return '/img/fpt.png';
  if (s.includes('tgdd') || s.includes('thegioididong') || s.includes('thế giới di động')) return '/img/tgdd.jpg';
  if (s.includes('nguyenkim') || s.includes('nguyễn kim')) return '/img/nguyenkim.png';
  return '/img/mtm.jpg';
}

/** Danh sách nguồn (id, tên, logo) — nhẹ, dùng cho thanh menu. */
export function useSources() {
  const q = useQuery({
    queryKey: ['dash', 'sources'],
    queryFn: () => dashboardApi.sources().then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const sources = useMemo(
    () => (q.data ?? []).map((s) => ({ ...s, logo: s.logo || fallbackLogo(s.id, s.name) })),
    [q.data],
  );
  return { sources, isLoading: q.isLoading, error: q.error };
}

/** Giới hạn an toàn khi tải hết một khoảng ngày (mỗi trang 100 bài). */
const MAX_ROWS = 5000;

async function fetchAllEvents(params) {
  const items = [];
  let cursor;
  do {
    const { data } = await dashboardApi.events({ ...params, limit: 100, cursor });
    items.push(...data.items);
    cursor = data.nextCursor ?? undefined;
  } while (cursor && items.length < MAX_ROWS);
  if (cursor) console.warn(`Khoảng ${params.from}..${params.to} có hơn ${MAX_ROWS} bài; chỉ hiển thị ${MAX_ROWS} bài mới nhất.`);
  return items;
}

const toEvent = (e) => ({
  id: e.id,
  date: e.date || '',
  time: e.time || '',
  type: e.type || 'other',
  title: e.title || '',
  fullTitle: e.title || '',
  desc: e.description || '',
  image: eventImage(e),
  url: e.url || '',
  origin: e.origin || 'crawler',
  sourceId: e.sourceId,
  sourceName: e.sourceName,
});

/**
 * Bài trong khoảng ngày [from, to] (giờ Việt Nam), trả theo định dạng cũ `sources[].events`
 * để các trang hiện có dùng lại được. Phân quyền phòng ban do backend lọc trong truy vấn.
 */
export function useRangeEvents(from, to, { includeOwn = true, enabled = true } = {}) {
  const { sources: meta } = useSources();
  const params = { from, to, includeOwn: includeOwn ? 'true' : undefined };
  const q = useQuery({
    queryKey: ['dash', 'range-events', params],
    queryFn: () => fetchAllEvents(params),
    enabled: enabled && Boolean(from && to),
  });

  const sources = useMemo(() => {
    const groups = new Map(meta.map((m) => [m.id, { id: m.id, name: m.name, logo: m.logo, events: [] }]));
    for (const raw of q.data ?? []) {
      const e = toEvent(raw);
      if (!groups.has(e.sourceId)) {
        groups.set(e.sourceId, { id: e.sourceId, name: e.sourceName || e.sourceId, logo: fallbackLogo(e.sourceId, e.sourceName), events: [] });
      }
      groups.get(e.sourceId).events.push(e);
    }
    return [...groups.values()].map((g) => ({
      ...g,
      totalEvents: g.events.length,
      stats: g.events.reduce((acc, ev) => ({ ...acc, [ev.type]: (acc[ev.type] || 0) + 1 }), {}),
    }));
  }, [meta, q.data]);

  return { sources, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

/** Bài có ảnh, mới nhất trước, tải thêm theo trang (thư viện ảnh). */
export function useImageEvents({ from, to, pageSize = 60 }) {
  const params = { from, to, includeOwn: 'true', hasImage: 'true', limit: pageSize };
  return useInfiniteQuery({
    queryKey: ['dash', 'image-events', params],
    queryFn: ({ pageParam }) => dashboardApi.events({ ...params, cursor: pageParam }).then((r) => r.data),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
