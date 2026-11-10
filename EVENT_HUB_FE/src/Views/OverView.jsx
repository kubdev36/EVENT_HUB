import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../API/API';
import {
  BrandChips,
  Card,
  DailyLineChart,
  Delta,
  Dot,
  EventFeed,
  HeatTable,
  KpiCard,
  Legend,
  Segmented,
  SeriesTable,
  StatusBox,
} from './dashboard/components';
import { TYPE_COLUMNS, TYPE_FILTERS, addDays, makeBrandColor, pctChange, useUrlState, vnToday } from './dashboard/shared';

const RANGES = [
  ['7', '7 ngày'],
  ['30', '30 ngày'],
  ['90', '90 ngày'],
];
const DEFAULTS = { range: '7', brands: '', type: 'all' };

const HEALTH = {
  success: ['bg-emerald-50 text-emerald-700', '✓ Ổn định'],
  partial: ['bg-amber-50 text-amber-800', '! Lỗi một phần'],
  blocked: ['bg-rose-50 text-rose-700', '✕ Bị chặn'],
  failed: ['bg-rose-50 text-rose-700', '✕ Lỗi'],
  running: ['bg-blue-50 text-blue-700', '… Đang chạy'],
};

const fetchData = (fn) => (params) => fn(params).then((r) => r.data);

export default function Overview() {
  const [filters, setFilters] = useUrlState(DEFAULTS);
  const [showTable, setShowTable] = useState(false);
  const today = vnToday();
  const days = Number(filters.range) || 7;
  const base = { from: addDays(today, -(days - 1)), to: today, type: filters.type === 'all' ? undefined : filters.type };
  const params = { ...base, brands: filters.brands || undefined };

  // Danh sách hãng và thứ tự màu lấy từ cấu hình nguồn, không phụ thuộc bộ lọc hãng.
  const allSources = useQuery({ queryKey: ['dash', 'summary', base], queryFn: () => fetchData(dashboardApi.summary)(base) });
  const summary = useQuery({ queryKey: ['dash', 'summary', params], queryFn: () => fetchData(dashboardApi.summary)(params) });
  const series = useQuery({ queryKey: ['dash', 'timeseries', params], queryFn: () => fetchData(dashboardApi.timeseries)(params) });
  const byType = useQuery({ queryKey: ['dash', 'breakdown', 'type', params], queryFn: () => fetchData(dashboardApi.breakdown)({ ...params, by: 'type' }) });
  const latest = useQuery({ queryKey: ['dash', 'events', params], queryFn: () => fetchData(dashboardApi.events)({ ...params, limit: 7 }) });

  const brandList = useMemo(() => allSources.data?.sources?.map((s) => ({ sourceId: s.sourceId, name: s.name })) ?? [], [allSources.data]);
  const colorOf = useMemo(() => makeBrandColor(brandList.map((b) => b.sourceId)), [brandList]);
  const nameOf = (id, fallback) => brandList.find((b) => b.sourceId === id)?.name ?? fallback ?? id;
  const selected = useMemo(
    () => (filters.brands ? filters.brands.split(',') : brandList.map((b) => b.sourceId)),
    [filters.brands, brandList],
  );

  const toggleBrand = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    if (next.length === 0) return; // luôn giữ ít nhất một hãng
    setFilters({ brands: next.length === brandList.length ? '' : next.join(',') });
  };

  // Mọi hãng đang chọn đều có đường, kể cả khi không có bài (giá trị 0).
  const lineSeries = useMemo(() => {
    if (!series.data) return [];
    const byId = new Map(series.data.series.map((s) => [s.sourceId, s.values]));
    return selected.map((id) => ({ sourceId: id, values: byId.get(id) ?? series.data.days.map(() => 0) }));
  }, [series.data, selected]);

  const heat = useMemo(() => {
    const rows = byType.data?.rows ?? [];
    const cols = [...TYPE_COLUMNS.map(([, label]) => label), 'Khác'];
    const values = selected.map((id) => {
      const counts = TYPE_COLUMNS.map(([, , types]) => rows.filter((r) => r.sourceId === id && types.includes(r.type)).reduce((s, r) => s + r.count, 0));
      const known = TYPE_COLUMNS.flatMap(([, , types]) => types);
      counts.push(rows.filter((r) => r.sourceId === id && !known.includes(r.type)).reduce((s, r) => s + r.count, 0));
      return counts;
    });
    return { cols, values };
  }, [byType.data, selected]);

  const s = summary.data;
  const top = s?.bySource?.[0];
  const healthy = s?.sources?.filter((x) => x.status === 'success').length ?? 0;
  const lastRun = s?.sources?.map((x) => x.startedAt).filter(Boolean).sort().at(-1);

  return (
    <div className="w-full min-h-full bg-[#f4f5f7] text-slate-800 p-4 sm:p-5 lg:p-6 pb-12">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-slate-900">Tổng quan</h1>
        <p className="text-xs text-slate-500">
          Hoạt động của đối thủ trong {days} ngày gần nhất · tính theo ngày đăng bài, giờ Việt Nam
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Segmented label="Khoảng thời gian" options={RANGES} value={filters.range} onChange={(range) => setFilters({ range })} />
        <BrandChips brands={brandList} selected={selected} onToggle={toggleBrand} colorOf={colorOf} />
        <Segmented label="Loại bài" options={TYPE_FILTERS} value={filters.type} onChange={(type) => setFilters({ type })} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
        <StatusBox isLoading={summary.isLoading} error={summary.error} height={98}>
          <KpiCard label={`Bài mới trong ${days} ngày`} value={s?.total ?? 0}>
            <Delta pct={pctChange(s?.total ?? 0, s?.previousTotal ?? 0)} suffix={`so với ${days} ngày trước (${s?.previousTotal ?? 0})`} />
          </KpiCard>
        </StatusBox>
        <StatusBox isLoading={summary.isLoading} error={summary.error} height={98}>
          <KpiCard label="Khuyến mãi đang chạy" value={s?.activePromos ?? 0}>
            Bài khuyến mãi đăng trong 14 ngày gần nhất
          </KpiCard>
        </StatusBox>
        <StatusBox isLoading={summary.isLoading} error={summary.error} height={98}>
          <KpiCard label="Hãng đăng nhiều nhất" value={top && top.current > 0 ? top.name : '—'}>
            {top && top.current > 0 && (
              <>
                <Dot color={colorOf(top.sourceId)} /> {top.current} bài trong kỳ
              </>
            )}
          </KpiCard>
        </StatusBox>
        <StatusBox isLoading={summary.isLoading} error={summary.error} height={98}>
          <KpiCard label="Thu thập dữ liệu" value={`${healthy}/${s?.sources?.length ?? 0} nguồn`}>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${healthy === s?.sources?.length ? HEALTH.success[0] : HEALTH.partial[0]}`}>
              {healthy === s?.sources?.length ? '✓ Ổn định' : '! Cần kiểm tra'}
            </span>
            {lastRun && <span>lần cuối {new Date(lastRun).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}</span>}
          </KpiCard>
        </StatusBox>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5 mb-3.5">
        <Card
          className="xl:col-span-2"
          title="Số bài mới mỗi ngày theo hãng"
          aside={
            <div className="flex items-center gap-3 flex-wrap">
              <Legend items={lineSeries.map((x) => ({ key: x.sourceId, label: nameOf(x.sourceId), color: colorOf(x.sourceId) }))} />
              <button type="button" onClick={() => setShowTable((v) => !v)} className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs cursor-pointer hover:bg-slate-50">
                {showTable ? 'Xem biểu đồ' : 'Xem bảng'}
              </button>
            </div>
          }
        >
          <StatusBox isLoading={series.isLoading} error={series.error} height={300}>
            {series.data &&
              (showTable ? (
                <SeriesTable days={series.data.days} series={lineSeries} nameOf={nameOf} />
              ) : (
                <DailyLineChart days={series.data.days} series={lineSeries} nameOf={nameOf} colorOf={colorOf} height={440} />
              ))}
          </StatusBox>
        </Card>

        <Card title="Mới nhất">
          <StatusBox isLoading={latest.isLoading} error={latest.error} empty={latest.data?.items?.length === 0} height={300}>
            <EventFeed items={latest.data?.items ?? []} nameOf={nameOf} colorOf={colorOf} />
          </StatusBox>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
        <Card className="xl:col-span-2" title="Loại bài theo hãng" aside={<span className="text-xs text-slate-500">Màu càng đậm càng nhiều bài</span>}>
          <StatusBox isLoading={byType.isLoading} error={byType.error} height={150}>
            <HeatTable
              rowLabels={selected.map((id) => nameOf(id))}
              colLabels={heat.cols}
              values={heat.values}
              totals
              rowLead={(i) => <Dot color={colorOf(selected[i])} />}
              describe={(i, j, v) => {
                const rowTotal = heat.values[i].reduce((a, b) => a + b, 0) || 1;
                return [
                  ['Số bài', `${v}`],
                  ['Tỷ lệ trong hãng', `${Math.round((v / rowTotal) * 100)}%`],
                ];
              }}
            />
          </StatusBox>
        </Card>

        <Card title="Tình trạng thu thập" aside={<span className="text-xs text-slate-500">{s?.sources?.length ?? 0} nguồn</span>}>
          <StatusBox isLoading={summary.isLoading} error={summary.error} height={150}>
            <ul>
              {(s?.sources ?? []).map((src, i) => {
                const [cls, label] = HEALTH[src.status] ?? ['bg-slate-100 text-slate-600', 'Chưa chạy'];
                return (
                  <li key={src.sourceId} className={`flex items-center justify-between gap-2 py-2 ${i ? 'border-t border-slate-100' : ''}`}>
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] flex items-center gap-1.5">
                        <Dot color={colorOf(src.sourceId)} />
                        {src.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {src.itemsFound} bài
                        {src.durationMs != null && ` · ${Math.round(src.durationMs / 1000)} giây`}
                        {src.startedAt &&
                          ` · ${new Date(src.startedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}`}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`} title={src.errorMessage ?? undefined}>
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </StatusBox>
        </Card>
      </div>
    </div>
  );
}
