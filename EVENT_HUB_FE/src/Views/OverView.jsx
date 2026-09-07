import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getBrandLogo } from '../constants/brandLogos';
import { useEventHubData } from '../API/useEventHubData';

import { useFilterContext } from '../context/FilterContext';

const COLORS = ['#2563eb', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

export default function Overview() {
  const [date, setDate] = useState(new Date());
  const { data: eventHubData } = useEventHubData();
  const { isEventVisible } = useFilterContext();

  const { competitors, totalEvents, totalUrls, slots, brandStats, calendar, eventDays } = useMemo(() => {
    const list = eventHubData.filter((b) => b.id !== 'minhtuan');
    const timeSlots = { '00:00': 0, '06:00': 0, '12:00': 0, '18:00': 0 };
    let events = 0;
    let urls = 0;
    const daysWithEvents = new Set();

    list.forEach((b) => {
      urls += (b.targetUrls || []).length;
      (b.events || []).forEach((e) => {
        if (!isEventVisible(e)) return;
        events++;
        if (e.date) daysWithEvents.add(e.date);
        if (e.time) {
          const h = parseInt(e.time, 10);
          const k = h < 6 ? '00:00' : h < 12 ? '06:00' : h < 18 ? '12:00' : '18:00';
          timeSlots[k]++;
        }
      });
    });

    const y = date.getFullYear();
    const m = date.getMonth();

    return {
      competitors: list,
      totalEvents: events,
      totalUrls: urls,
      slots: Object.keys(timeSlots).map((time) => ({ time, events: timeSlots[time] })),
      brandStats: list.map((b) => ({
        id: b.id,
        name: b.name,
        logo: getBrandLogo(b.id, b.name, b.logo),
        events: (b.events || []).length,
      })),
      calendar: {
        blanks: Array.from({ length: new Date(y, m, 1).getDay() }, (_, i) => i),
        days: Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => i + 1),
        year: y,
        month: m + 1,
      },
      eventDays: daysWithEvents,
    };
  }, [date, eventHubData]);

  return (
    <div className="w-full min-h-full bg-[#f4f7fc] text-slate-800 font-sans p-4 sm:p-5 lg:p-6 flex flex-col xl:flex-row gap-5 pb-12">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Tổng quan</h1>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">{totalEvents}</div>
            <div>
              <div className="text-[11px] text-slate-400">Sự kiện đối thủ</div>
              <div className="text-lg font-bold">{totalEvents} bài</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">{competitors.length}</div>
            <div>
              <div className="text-[11px] text-slate-400">Chuỗi đối thủ</div>
              <div className="text-lg font-bold">{competitors.length} hãng</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">{totalUrls}</div>
            <div>
              <div className="text-[11px] text-slate-400">Trang web quét</div>
              <div className="text-lg font-bold">{totalUrls} URLs</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">6h</div>
            <div>
              <div className="text-[11px] text-slate-400">Tần suất cào</div>
              <div className="text-lg font-bold">4 lần/ngày</div>
            </div>
          </div>
        </div>

        <div className="xl:hidden bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Tháng {calendar.month}, {calendar.year}</span>
            <div className="flex gap-1">
              <button onClick={() => setDate(new Date(calendar.year, calendar.month - 2, 1))} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setDate(new Date(calendar.year, calendar.month, 1))} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center gap-y-2 text-xs">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d, i) => (
              <span key={i} className="text-[10px] text-slate-400 font-semibold">{d}</span>
            ))}
            {calendar.blanks.map((_, i) => <span key={`b-${i}`} />)}
            {calendar.days.map((day) => {
              const selected = day === date.getDate();
              const dayStr = `${calendar.year}-${String(calendar.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasEvt = eventDays.has(dayStr);

              return (
                <button
                  key={day}
                  onClick={() => setDate(new Date(calendar.year, calendar.month - 1, day))}
                  className={`w-7 h-7 mx-auto rounded-full flex flex-col items-center justify-center text-xs font-medium relative cursor-pointer ${
                    selected ? 'bg-blue-600 text-white font-bold' : hasEvt ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{day}</span>
                  {hasEvt && !selected && <span className="absolute bottom-0.5 w-1 h-1 bg-blue-600 rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <h3 className="text-sm font-bold">Thị phần sự kiện</h3>
            <div className="h-40 w-full flex items-center justify-center my-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={brandStats} cx="50%" cy="50%" innerRadius={42} outerRadius={60} dataKey="events" paddingAngle={3}>
                    {brandStats.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] pt-2 border-t border-slate-50">
              {brandStats.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <span
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                  />
                  <span className="text-slate-600">
                    {item.name}: <strong className="text-slate-900 font-mono">{item.events}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <h3 className="text-sm font-bold">Biến thiên sự kiện (6 tiếng/lần)</h3>
            <div className="h-48 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={slots} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip formatter={(value) => [value, 'Sự kiện']} />
                  <Bar dataKey="events" name="Sự kiện" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-2">
          <h3 className="text-sm font-bold">Số lượng sự kiện theo hãng</h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={brandStats} margin={{ top: 15, right: 20, left: -25, bottom: 25 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                  tick={({ x, y, payload }) => {
                    const brand = brandStats.find((b) => b.name === payload.value);
                    const logoSrc = getBrandLogo(brand?.id, brand?.name, brand?.logo);
                    return (
                      <g transform={`translate(${x},${y})`}>
                        {logoSrc && (
                          <image x={-10} y={6} width={20} height={20} href={logoSrc} preserveAspectRatio="xMidYMid meet" />
                        )}
                        <text x={0} y={36} textAnchor="middle" fill="#475569" fontSize={10} fontWeight={600}>
                          {payload.value}
                        </text>
                      </g>
                    );
                  }}
                />
                <YAxis allowDecimals={false} domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => [value, 'Sự kiện']} />
                <Line type="monotone" dataKey="events" name="Sự kiện" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4">
        <div className="hidden xl:block bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Tháng {calendar.month}, {calendar.year}</span>
            <div className="flex gap-1">
              <button onClick={() => setDate(new Date(calendar.year, calendar.month - 2, 1))} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setDate(new Date(calendar.year, calendar.month, 1))} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center gap-y-2 text-xs">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d, i) => (
              <span key={i} className="text-[10px] text-slate-400 font-semibold">{d}</span>
            ))}
            {calendar.blanks.map((_, i) => <span key={`b-${i}`} />)}
            {calendar.days.map((day) => {
              const selected = day === date.getDate();
              const dayStr = `${calendar.year}-${String(calendar.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasEvt = eventDays.has(dayStr);
              return (
                <button key={day} onClick={() => setDate(new Date(calendar.year, calendar.month - 1, day))} className={`w-7 h-7 mx-auto rounded-full flex flex-col items-center justify-center text-xs font-medium relative cursor-pointer ${
                  selected ? 'bg-blue-600 text-white font-bold' : hasEvt ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200' : 'text-slate-700 hover:bg-slate-100'
                }`}>
                  <span>{day}</span>
                  {hasEvt && !selected && <span className="absolute bottom-0.5 w-1 h-1 bg-blue-600 rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-3">
          <span className="text-sm font-bold">Thương hiệu đối thủ</span>
          <div className="space-y-2">
            {competitors.map((b) => (
              <div key={b.id} className="p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 border border-slate-200 rounded-lg flex items-center justify-center bg-white p-0.5 shrink-0">
                    <img
                      src={getBrandLogo(b.id, b.name, b.logo)}
                      alt={b.name}
                      onError={(e) => { e.currentTarget.src = getBrandLogo(b.id, b.name); }}
                      className="w-full h-full object-contain rounded"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{b.name}</div>
                    <div className="text-[10px] text-slate-400">{(b.targetUrls || []).length} URLs</div>
                  </div>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded shrink-0">{(b.events || []).length} bài</span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
