import { useState } from 'react';
import { eventImage } from '../../API/useDashboardEvents';
import { formatDay, heatColor, relativeTime, safeHttpUrl, typeLabel, useElementWidth } from './shared';

// ---------- Khung ----------
export function Card({ title, aside, children, className = '' }) {
  return (
    <section className={`bg-white border border-slate-200/80 rounded-xl p-4 min-w-0 ${className}`}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export const Dot = ({ color }) => <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />;

export function StatusBox({ isLoading, error, empty, children, height = 120 }) {
  if (isLoading) return <div className="animate-pulse bg-slate-100 rounded-lg" style={{ height }} />;
  if (error)
    return (
      <div className="text-xs text-rose-700 bg-rose-50 rounded-lg p-3">
        Không tải được dữ liệu. {error?.response?.data?.message || error.message}
      </div>
    );
  if (empty) return <div className="text-xs text-slate-500 py-6 text-center">Không có dữ liệu trong khoảng này.</div>;
  return children;
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex bg-white border border-slate-200 rounded-lg p-0.5 max-w-full overflow-x-auto">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap cursor-pointer ${value === v ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function BrandChips({ brands, selected, onToggle, colorOf }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {brands.map((b) => {
        const on = selected.includes(b.sourceId);
        return (
          <button
            key={b.sourceId}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(b.sourceId)}
            className={`inline-flex items-center gap-1.5 border border-slate-200 bg-white rounded-full px-2.5 py-1 text-xs cursor-pointer ${on ? 'text-slate-700' : 'text-slate-400 opacity-60'}`}
          >
            <Dot color={colorOf(b.sourceId)} />
            {b.name}
          </button>
        );
      })}
    </div>
  );
}

export function KpiCard({ label, value, children }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-4 min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 my-1 tabular-nums truncate">{value}</div>
      <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

export function Delta({ pct, suffix }) {
  if (pct == null) return <span className="text-slate-400">Chưa có số kỳ trước</span>;
  const up = pct >= 0;
  return (
    <>
      <span className={`font-semibold ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
        {up ? '▲' : '▼'} {Math.abs(pct)}%
      </span>
      <span>{suffix}</span>
    </>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex gap-3 flex-wrap text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">
          <Dot color={i.color} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ---------- Tooltip dùng chung ----------
function useTooltip() {
  const [tip, setTip] = useState(null);
  const show = (e, title, rows) => setTip({ x: e.clientX, y: e.clientY, title, rows });
  const hide = () => setTip(null);
  const node = tip && (
    <div
      className="fixed z-50 pointer-events-none bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-40"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 220), top: tip.y + 14 }}
    >
      <div className="font-semibold mb-1">{tip.title}</div>
      {tip.rows.map(([label, value, color]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            {color && <Dot color={color} />}
            {label}
          </span>
          <b className="tabular-nums">{value}</b>
        </div>
      ))}
    </div>
  );
  return { show, hide, node };
}

// ---------- Biểu đồ đường: số bài mỗi ngày theo hãng ----------
export function DailyLineChart({ days, series, nameOf, colorOf, height = 300 }) {
  const [ref, width] = useElementWidth();
  const tip = useTooltip();
  const [hover, setHover] = useState(null);
  const W = Math.max(width, 280);
  const m = { l: 30, r: 16, t: 10, b: 24 };
  const n = days.length;
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const yMax = Math.ceil(max / 4) * 4;
  const x = (i) => m.l + (i * (W - m.l - m.r)) / Math.max(1, n - 1);
  const y = (v) => m.t + (height - m.t - m.b) * (1 - v / yMax);
  const step = Math.max(1, Math.ceil(n / 6));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    setHover(i);
    tip.show(
      e,
      formatDay(days[i], { weekday: 'short', day: '2-digit', month: '2-digit' }),
      [...series].sort((a, b) => b.values[i] - a.values[i]).map((s) => [nameOf(s.sourceId), `${s.values[i]} bài`, colorOf(s.sourceId)]),
    );
  };

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={W} height={height} role="img" aria-label="Số bài mới mỗi ngày theo hãng" className="block">
          {[0, 1, 2, 3, 4].map((k) => {
            const v = (yMax / 4) * k;
            return (
              <g key={k}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="#eceef1" />
                <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
                  {v}
                </text>
              </g>
            );
          })}
          {days.map((d, i) =>
            i % step === 0 || i === n - 1 ? (
              <text key={d} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-slate-400 text-[11px]">
                {formatDay(d)}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <path
              key={s.sourceId}
              d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join('')}
              fill="none"
              stroke={colorOf(s.sourceId)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {/* Tên hãng đã có trong chú thích phía trên; chỉ đánh dấu điểm cuối. */}
          {series.map((s) => (
            <circle key={s.sourceId} cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} fill={colorOf(s.sourceId)} stroke="#fff" strokeWidth={2} />
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={height - m.b} stroke="#7c7b76" strokeDasharray="3 3" />}
          <rect
            x={m.l}
            y={m.t}
            width={W - m.l - m.r}
            height={height - m.t - m.b}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => {
              setHover(null);
              tip.hide();
            }}
          />
        </svg>
      )}
      {tip.node}
    </div>
  );
}

/** Bảng thay cho biểu đồ (người dùng không phân biệt được màu, hoặc cần số chính xác). */
export function SeriesTable({ days, series, nameOf }) {
  return (
    <div className="overflow-x-auto max-h-80">
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left font-medium py-1.5 px-2">Ngày</th>
            {series.map((s) => (
              <th key={s.sourceId} className="text-right font-medium py-1.5 px-2">
                {nameOf(s.sourceId)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...days.keys()].reverse().map((i) => (
            <tr key={days[i]} className="border-t border-slate-100">
              <td className="py-1.5 px-2">{formatDay(days[i])}</td>
              {series.map((s) => (
                <td key={s.sourceId} className="py-1.5 px-2 text-right tabular-nums">
                  {s.values[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Bảng nhiệt ----------
export function HeatTable({ rowLabels, colLabels, values, rowLead, totals = false, describe }) {
  const tip = useTooltip();
  const max = Math.max(1, ...values.flat());
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate" style={{ borderSpacing: 2 }}>
        <thead className="text-slate-500">
          <tr>
            <th />
            {colLabels.map((c) => (
              <th key={c} className="font-medium text-center py-1 px-1 whitespace-nowrap">
                {c}
              </th>
            ))}
            {totals && <th className="font-medium text-right py-1 px-2">Tổng</th>}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((r, i) => (
            <tr key={r}>
              <td className="py-1 pr-2 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  {rowLead?.(i)}
                  {r}
                </span>
              </td>
              {values[i].map((v, j) => (
                <td
                  key={colLabels[j]}
                  className="text-center tabular-nums rounded py-1.5 px-1"
                  style={heatColor(v, max)}
                  onMouseMove={(e) => tip.show(e, `${r} · ${colLabels[j]}`, describe(i, j, v))}
                  onMouseLeave={tip.hide}
                >
                  {v}
                </td>
              ))}
              {totals && <td className="text-right tabular-nums px-2">{values[i].reduce((a, b) => a + b, 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {tip.node}
    </div>
  );
}

// ---------- Thanh thị phần ----------
export function ShareBars({ rows, colorOf }) {
  const tip = useTooltip();
  const total = rows.reduce((s, r) => s + r.current, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.current));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const share = Math.round((r.current / total) * 100);
        const delta = r.current - r.previous;
        return (
          <div
            key={r.sourceId}
            className="grid grid-cols-[110px_1fr_76px] items-center gap-3 text-xs"
            onMouseMove={(e) =>
              tip.show(e, r.name, [
                ['Kỳ này', `${r.current} bài`, colorOf(r.sourceId)],
                ['Kỳ trước', `${r.previous} bài`],
                ['Thay đổi', `${delta >= 0 ? '+' : ''}${delta} bài`],
                ['Thị phần', `${share}%`],
              ])
            }
            onMouseLeave={tip.hide}
          >
            <span className="text-slate-600 truncate">{r.name}</span>
            <span className="h-4 bg-slate-100 rounded overflow-hidden">
              <span className="block h-full rounded" style={{ width: `${Math.max(2, (r.current / max) * 100)}%`, background: colorOf(r.sourceId) }} />
            </span>
            <span className="font-semibold tabular-nums text-slate-800">
              {share}% · {r.current}
            </span>
          </div>
        );
      })}
      {tip.node}
    </div>
  );
}

// ---------- Cột nhỏ theo tuần, mỗi hãng một biểu đồ, chung thang đo ----------
export function WeeklyBars({ weeks, values, color, yMax, label }) {
  const [ref, width] = useElementWidth();
  const tip = useTooltip();
  const W = Math.max(width, 220);
  const H = 110;
  const m = { l: 24, r: 4, t: 6, b: 18 };
  const bw = (W - m.l - m.r) / Math.max(1, weeks.length);
  const top = Math.max(1, yMax);
  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={W} height={H} role="img" aria-label={label} className="block">
          {[0, top / 2, top].map((v) => {
            const yy = m.t + (H - m.t - m.b) * (1 - v / top);
            return (
              <g key={v}>
                <line x1={m.l} x2={W - m.r} y1={yy} y2={yy} stroke="#eceef1" />
                <text x={m.l - 4} y={yy + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
                  {Math.round(v)}
                </text>
              </g>
            );
          })}
          {values.map((v, i) => {
            const bh = ((H - m.t - m.b) * v) / top;
            const x0 = m.l + i * bw + 1;
            const yy = H - m.b - bh;
            const r = Math.min(4, bh);
            return (
              <g key={weeks[i]}>
                {v > 0 && (
                  <path
                    d={`M${x0} ${H - m.b}V${yy + r}q0 -${r} ${r} -${r}h${Math.max(0, bw - 2 - 2 * r)}q${r} 0 ${r} ${r}V${H - m.b}Z`}
                    fill={color}
                  />
                )}
                {(i % 3 === 0 || i === values.length - 1) && (
                  <text x={x0 + bw / 2 - 1} y={H - 4} textAnchor="middle" className="fill-slate-400 text-[10px]">
                    {formatDay(weeks[i])}
                  </text>
                )}
                <rect
                  x={m.l + i * bw}
                  y={m.t}
                  width={bw}
                  height={H - m.t - m.b}
                  fill="transparent"
                  onMouseMove={(e) => tip.show(e, `Tuần từ ${formatDay(weeks[i])}`, [['Bài', `${v}`, color]])}
                  onMouseLeave={tip.hide}
                />
              </g>
            );
          })}
        </svg>
      )}
      {tip.node}
    </div>
  );
}

// ---------- Danh sách bài ----------
export function EventThumb({ src }) {
  const [broken, setBroken] = useState(false);
  const url = safeHttpUrl(src);
  if (!url || broken) return <div className="w-14 h-10 rounded-md bg-slate-100 shrink-0" aria-hidden />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="w-14 h-10 rounded-md object-cover bg-slate-100 shrink-0"
    />
  );
}

export function EventFeed({ items, nameOf, colorOf }) {
  return (
    <ul className="flex flex-col">
      {items.map((ev, i) => {
        const href = safeHttpUrl(ev.url);
        return (
          <li key={ev.id} className={`flex gap-3 py-2.5 ${i ? 'border-t border-slate-100' : 'pt-0'}`}>
            <EventThumb src={eventImage(ev)} />
            <div className="min-w-0">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-slate-900 hover:text-blue-700 line-clamp-2">
                  {ev.title}
                </a>
              ) : (
                <span className="text-[13px] font-semibold line-clamp-2">{ev.title}</span>
              )}
              <div className="flex items-center gap-1.5 flex-wrap text-[11.5px] text-slate-500 mt-0.5">
                <Dot color={colorOf(ev.sourceId)} />
                {nameOf(ev.sourceId, ev.sourceName)}
                <span className="border border-slate-200 rounded-full px-1.5">{typeLabel(ev.type)}</span>
                {relativeTime(ev.date, ev.time)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
