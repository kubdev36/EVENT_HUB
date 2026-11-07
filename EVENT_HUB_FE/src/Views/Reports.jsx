import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../API/API';
import { eventImage } from '../API/useDashboardEvents';
import { Card, Dot, EventThumb, HeatTable, KpiCard, Delta, Segmented, ShareBars, StatusBox, WeeklyBars } from './dashboard/components';
import {
  addDays,
  downloadCsv,
  formatDay,
  makeBrandColor,
  pctChange,
  periodRange,
  safeHttpUrl,
  typeLabel,
  useUrlState,
  vnToday,
} from './dashboard/shared';

const PERIODS = [
  ['week', 'Tuần này'],
  ['month', 'Tháng này'],
  ['quarter', 'Quý này'],
];
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const SLOTS = [
  ['0–6h', 0, 6],
  ['6–9h', 6, 9],
  ['9–12h', 9, 12],
  ['12–15h', 12, 15],
  ['15–18h', 15, 18],
  ['18–21h', 18, 21],
  ['21–24h', 21, 24],
];
const WEEKS = 12;
const CSV_MAX_ROWS = 2000;
const get = (fn, params) => fn(params).then((r) => r.data);

export default function Reports() {
  const [filters, setFilters] = useUrlState({ period: 'week' });
  const [exporting, setExporting] = useState(false);
  const today = vnToday();
  const range = periodRange(filters.period, today);

  // 12 tuần gần nhất, bắt đầu từ thứ Hai.
  const thisMonday = periodRange('week', today).from;
  const weeksFrom = addDays(thisMonday, -7 * (WEEKS - 1));
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(weeksFrom, 7 * i));

  const summary = useQuery({ queryKey: ['dash', 'summary', range], queryFn: () => get(dashboardApi.summary, range) });
  const byType = useQuery({ queryKey: ['dash', 'breakdown', 'type', range], queryFn: () => get(dashboardApi.breakdown, { ...range, by: 'type' }) });
  const when = useQuery({ queryKey: ['dash', 'breakdown', 'wh', range], queryFn: () => get(dashboardApi.breakdown, { ...range, by: 'weekday-hour' }) });
  const weekly = useQuery({
    queryKey: ['dash', 'breakdown', 'week', weeksFrom, today],
    queryFn: () => get(dashboardApi.breakdown, { from: weeksFrom, to: today, type: 'promo', by: 'week' }),
  });
  const topPromos = useQuery({ queryKey: ['dash', 'events', 'promo', range], queryFn: () => get(dashboardApi.events, { ...range, type: 'promo', limit: 10 }) });

  const sources = useMemo(() => summary.data?.sources ?? [], [summary.data]);
  const colorOf = useMemo(() => makeBrandColor(sources.map((s) => s.sourceId)), [sources]);
  const nameOf = (id, fallback) => sources.find((s) => s.sourceId === id)?.name ?? fallback ?? id;

  const s = summary.data;
  const promoTotal = (byType.data?.rows ?? []).filter((r) => r.type === 'promo' || r.type === 'sale').reduce((a, r) => a + r.count, 0);

  const whenGrid = useMemo(() => {
    const grid = WEEKDAYS.map(() => SLOTS.map(() => 0));
    for (const r of when.data?.rows ?? []) {
      const slot = SLOTS.findIndex(([, a, b]) => r.hour >= a && r.hour < b);
      if (r.weekday >= 1 && r.weekday <= 7 && slot >= 0) grid[r.weekday - 1][slot] += r.count;
    }
    return grid;
  }, [when.data]);
  const peak = useMemo(() => {
    let best = null;
    whenGrid.forEach((row, d) => row.forEach((v, j) => (!best || v > best.v ? (best = { v, d, j }) : null)));
    return best && best.v > 0 ? best : null;
  }, [whenGrid]);

  const weeklyRows = weekly.data?.rows ?? [];
  const weeklyBySource = (() => {
    const rows = weeklyRows;
    const keys = Array.from({ length: WEEKS }, (_, i) => addDays(weeksFrom, 7 * i));
    return sources.map((src) => ({
      ...src,
      values: keys.map((w) => rows.find((r) => r.sourceId === src.sourceId && r.week === w)?.count ?? 0),
    }));
  })();
  const weeklyMax = Math.max(1, ...weeklyBySource.flatMap((x) => x.values));

  /** Xuất mọi bài trong kỳ (phân trang qua API), tối đa CSV_MAX_ROWS dòng. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = [];
      let cursor;
      do {
        const page = await get(dashboardApi.events, { ...range, limit: 100, cursor });
        rows.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor && rows.length < CSV_MAX_ROWS);
      downloadCsv(
        `bao-cao-${range.from}_${range.to}.csv`,
        ['Ngày', 'Giờ', 'Hãng', 'Loại', 'Tiêu đề', 'Link'],
        rows.map((e) => [e.date, e.time, nameOf(e.sourceId, e.sourceName), typeLabel(e.type), e.title, e.url]),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full min-h-full bg-[#f4f5f7] text-slate-800 p-4 sm:p-5 lg:p-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Báo cáo</h1>
          <p className="text-xs text-slate-500">
            {formatDay(range.from, { day: '2-digit', month: '2-digit', year: 'numeric' })} – {formatDay(range.to, { day: '2-digit', month: '2-digit', year: 'numeric' })} · so với kỳ trước cùng độ dài
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Segmented label="Kỳ báo cáo" options={PERIODS} value={filters.period} onChange={(period) => setFilters({ period })} />
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className="border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? 'Đang xuất...' : 'Xuất CSV'}
          </button>
          <button type="button" disabled title="Sắp có" className="border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs text-slate-400 cursor-not-allowed">
            Xuất Excel · sắp có
          </button>
          <button type="button" disabled title="Sắp có" className="rounded-lg px-3 py-1.5 text-xs bg-blue-600/40 text-white cursor-not-allowed">
            Gửi báo cáo tuần qua Telegram · sắp có
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
        <StatusBox isLoading={summary.isLoading} error={summary.error} height={98}>
          <KpiCard label="Tổng bài của đối thủ" value={s?.total ?? 0}>
            <Delta pct={pctChange(s?.total ?? 0, s?.previousTotal ?? 0)} suffix="so với kỳ trước" />
          </KpiCard>
        </StatusBox>
        <StatusBox isLoading={byType.isLoading} error={byType.error} height={98}>
          <KpiCard label="Bài khuyến mãi" value={promoTotal}>
            {s?.total ? `Chiếm ${Math.round((promoTotal / s.total) * 100)}% tổng bài` : 'Chưa có bài trong kỳ'}
          </KpiCard>
        </StatusBox>
        <KpiCard label="Sản phẩm được nhắc nhiều nhất" value="Sắp có">
          Cần trích tên sản phẩm từ tiêu đề bài
        </KpiCard>
        <StatusBox isLoading={when.isLoading} error={when.error} height={98}>
          <KpiCard label="Khung giờ đăng nhiều nhất" value={peak ? SLOTS[peak.j][0] : '—'}>
            {peak ? `${WEEKDAYS[peak.d]} · ${peak.v} bài` : 'Chưa đủ dữ liệu giờ đăng'}
          </KpiCard>
        </StatusBox>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 mb-3.5">
        <Card title="Thị phần bài đăng" aside={<span className="text-xs text-slate-500">rê chuột để so với kỳ trước</span>}>
          <StatusBox isLoading={summary.isLoading} error={summary.error} empty={!s?.total} height={150}>
            <ShareBars rows={s?.bySource ?? []} colorOf={colorOf} />
          </StatusBox>
        </Card>
        <Card title="Đối thủ đăng bài vào lúc nào?" aside={<span className="text-xs text-slate-500">Giờ Việt Nam · màu đậm = nhiều bài</span>}>
          <StatusBox isLoading={when.isLoading} error={when.error} height={220}>
            <HeatTable
              rowLabels={WEEKDAYS}
              colLabels={SLOTS.map(([l]) => l)}
              values={whenGrid}
              describe={(i, j, v) => [['Số bài', `${v}`]]}
            />
            <p className="text-xs text-slate-500 mt-2">Chỉ tính bài có giờ đăng; bài chỉ có ngày không nằm trong bảng này.</p>
          </StatusBox>
        </Card>
      </div>

      <Card className="mb-3.5" title="Nhịp độ khuyến mãi theo tuần" aside={<span className="text-xs text-slate-500">12 tuần gần nhất · mỗi hãng một biểu đồ, cùng thang đo</span>}>
        <StatusBox isLoading={weekly.isLoading} error={weekly.error} height={240}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weeklyBySource.map((src) => (
              <div key={src.sourceId} className="min-w-0">
                <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-1">
                  <Dot color={colorOf(src.sourceId)} />
                  {src.name} · {src.values.reduce((a, b) => a + b, 0)} bài khuyến mãi
                </h4>
                <WeeklyBars weeks={weeks} values={src.values} color={colorOf(src.sourceId)} yMax={weeklyMax} label={`Bài khuyến mãi theo tuần của ${src.name}`} />
              </div>
            ))}
          </div>
        </StatusBox>
      </Card>

      <Card title="Khuyến mãi mới nhất trong kỳ">
        <StatusBox isLoading={topPromos.isLoading} error={topPromos.error} empty={topPromos.data?.items?.length === 0} height={200}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left font-medium py-2 px-2">Chương trình</th>
                  <th className="text-left font-medium py-2 px-2">Hãng</th>
                  <th className="text-left font-medium py-2 px-2 whitespace-nowrap">Ngày đăng</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(topPromos.data?.items ?? []).map((e) => {
                  const href = safeHttpUrl(e.url);
                  return (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2.5 min-w-60">
                          <EventThumb src={eventImage(e)} />
                          <span className="line-clamp-2">{e.title}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Dot color={colorOf(e.sourceId)} />
                          {nameOf(e.sourceId, e.sourceName)}
                        </span>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap tabular-nums">{e.date ? formatDay(e.date) : '—'}</td>
                      <td className="py-2 px-2 text-right">
                        {href && (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline whitespace-nowrap">
                            Mở bài
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </StatusBox>
        <p className="text-xs text-slate-500 mt-2">Bài chưa rõ ngày đăng không được tính vào báo cáo.</p>
      </Card>
    </div>
  );
}
