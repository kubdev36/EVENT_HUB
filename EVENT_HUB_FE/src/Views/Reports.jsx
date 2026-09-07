import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  MoreVertical,
  FileSpreadsheet,
  FileText,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useEventHubData } from '../API/useEventHubData';
import { CATEGORY_STYLES } from '../constants/eventStyles';
import { getBrandLogo } from '../constants/brandLogos';

export default function Reports() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { data: eventHubData } = useEventHubData();

  const { competitors, totalEvents, timelineData, brandChartData, calendarGrid, dailyEvents, eventDaysSet } = useMemo(() => {
    const list = eventHubData.filter((b) => b.id !== 'minhtuan');
    const allEvents = [];
    const dateCounts = {};
    const eventDays = new Set();

    eventHubData.forEach((b) => {
      (b.events || []).forEach((e) => {
        allEvents.push({ ...e, brandName: b.name, logo: b.logo });
        if (e.date) {
          dateCounts[e.date] = (dateCounts[e.date] || 0) + 1;
          eventDays.add(e.date);
        }
      });
    });

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const d = currentDate.getDate();
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    return {
      competitors: list,
      totalEvents: allEvents.length,
      timelineData: Object.entries(dateCounts).map(([date, count]) => ({
        date: date.split('-').reverse().slice(0, 2).join('/'),
        count,
      })),
      brandChartData: list.map((b) => ({ subject: b.name, A: (b.events || []).length })),
      calendarGrid: {
        blanks: Array.from({ length: new Date(y, m, 1).getDay() }, (_, i) => i),
        days: Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => i + 1),
        year: y,
        month: m + 1,
      },
      dailyEvents: allEvents.filter((item) => item.date === dateStr),
      eventDaysSet: eventDays,
    };
  }, [currentDate, eventHubData]);

  const handleExportExcel = () => {
    const allEvents = eventHubData.flatMap((b) =>
      (b.events || []).map((e) => ({
        'Thương hiệu': b.name,
        'Tiêu đề': e.title,
        'Phân loại': e.type,
        'Ngày': e.date,
        'Giờ': e.time,
        'Đường dẫn': e.url || '',
      }))
    );

    if (allEvents.length === 0) {
      alert('Chưa có dữ liệu sự kiện để xuất báo cáo.');
      return;
    }

    const headers = Object.keys(allEvents[0]).join(',');
    const rows = allEvents.map((row) =>
      Object.values(row)
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(',')
    );

    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Bao_Cao_Su_Kien_EventHub_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full min-h-full bg-[#f4f7fc] text-slate-800 font-sans p-4 sm:p-5 lg:p-6 flex flex-col xl:flex-row gap-5">
      
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Báo cáo dữ liệu crawl</h1>
            <p className="text-xs text-slate-500 mt-0.5">Thống kê sự kiện theo ngày/tháng</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition"
            >
              <FileSpreadsheet size={14} className="text-emerald-600" />
              <span>Xuất Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition"
            >
              <FileText size={14} />
              <span>Xuất CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">{totalEvents}</div>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">Sự kiện</div>
              <div className="text-lg font-bold text-slate-900">{totalEvents} bài</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">{competitors.length}</div>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">Đối thủ</div>
              <div className="text-lg font-bold text-slate-900">{competitors.length} hãng</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">6h</div>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">Tần suất</div>
              <div className="text-lg font-bold text-slate-900">4 lần/ngày</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">24h</div>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">Trạng thái</div>
              <div className="text-lg font-bold text-slate-900">Hoạt động</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-800">Năng lực đối thủ</h3>
            <div className="h-48 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={brandChartData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 10 }} />
                  <PolarRadiusAxis tick={false} />
                  <Radar dataKey="A" stroke="#2563eb" fill="#2563eb" fillOpacity={0.35} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-800">Xu hướng biến động</h3>
            <div className="h-48 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="xl:hidden bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Tháng {calendarGrid.month}, {calendarGrid.year}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentDate(new Date(calendarGrid.year, calendarGrid.month - 2, 1))} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setCurrentDate(new Date(calendarGrid.year, calendarGrid.month, 1))} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center gap-y-2 text-xs">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d, i) => (
              <span key={i} className="text-[10px] text-slate-400 font-semibold">{d}</span>
            ))}
            {calendarGrid.blanks.map((_, i) => <span key={`b-${i}`} />)}
            {calendarGrid.days.map((day) => {
              const isSelected = day === currentDate.getDate();
              const dayStr = `${calendarGrid.year}-${String(calendarGrid.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasEvent = eventDaysSet.has(dayStr);

              return (
                <button
                  key={day}
                  onClick={() => setCurrentDate(new Date(calendarGrid.year, calendarGrid.month - 1, day))}
                  className={`w-7 h-7 mx-auto rounded-full flex flex-col items-center justify-center text-xs font-medium relative ${
                    isSelected ? 'bg-blue-600 text-white font-bold' : hasEvent ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{day}</span>
                  {hasEvent && !isSelected && <span className="absolute bottom-0.5 w-1 h-1 bg-blue-600 rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              Ngày {String(currentDate.getDate()).padStart(2, '0')}/{String(currentDate.getMonth() + 1).padStart(2, '0')}/{currentDate.getFullYear()}
            </h3>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">{dailyEvents.length} bài</span>
          </div>

          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {dailyEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Không có bài viết nào trong ngày này.</div>
            ) : (
              dailyEvents.map((item, idx) => (
                <div key={idx} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl border border-slate-100 p-0.5 flex items-center justify-center shrink-0">
                      {item.logo ? <img src={item.logo} alt="" className="w-full h-full object-contain rounded-lg" /> : <span>{item.brandName[0]}</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{item.title}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1"><Clock size={12} /> {item.brandName} • {item.time}</div>
                    </div>
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 flex items-center justify-center shrink-0">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4">
        <div className="hidden xl:block bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Tháng {calendarGrid.month}, {calendarGrid.year}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentDate(new Date(calendarGrid.year, calendarGrid.month - 2, 1))} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setCurrentDate(new Date(calendarGrid.year, calendarGrid.month, 1))} className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center gap-y-2 text-xs">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d, i) => (
              <span key={i} className="text-[10px] text-slate-400 font-semibold">{d}</span>
            ))}
            {calendarGrid.blanks.map((_, i) => <span key={`b-${i}`} />)}
            {calendarGrid.days.map((day) => {
              const isSelected = day === currentDate.getDate();
              const dayStr = `${calendarGrid.year}-${String(calendarGrid.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasEvent = eventDaysSet.has(dayStr);
              return (
                <button key={day} onClick={() => setCurrentDate(new Date(calendarGrid.year, calendarGrid.month - 1, day))} className={`w-7 h-7 mx-auto rounded-full flex flex-col items-center justify-center text-xs font-medium relative ${
                  isSelected ? 'bg-blue-600 text-white font-bold' : hasEvent ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200' : 'text-slate-700 hover:bg-slate-100'
                }`}>
                  <span>{day}</span>
                  {hasEvent && !isSelected && <span className="absolute bottom-0.5 w-1 h-1 bg-blue-600 rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-3">
          <span className="text-sm font-bold text-slate-800">Thương hiệu đối thủ</span>
          <div className="space-y-2">
            {competitors.map((brand) => (
              <div key={brand.id} className="p-2.5 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 bg-white border border-slate-200/80 p-0.5 flex items-center justify-center shrink-0 rounded-lg">
                    <img
                      src={getBrandLogo(brand.id, brand.name, brand.logo)}
                      alt={brand.name}
                      onError={(e) => { e.currentTarget.src = getBrandLogo(brand.id, brand.name); }}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{brand.name}</div>
                    <div className="text-[10px] text-slate-400">{(brand.targetUrls || []).length} URLs</div>
                  </div>
                </div>
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md text-blue-600 bg-blue-50">
                  {(brand.events || []).length} bài
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
