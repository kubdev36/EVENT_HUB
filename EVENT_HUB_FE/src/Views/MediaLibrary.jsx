import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronLeft, 
  ChevronRight, 
  X, 
  Info, 
  ExternalLink, 
  Sparkles,
  Calendar,
  Clock
} from 'lucide-react';
import { useEventHubData } from '../API/useEventHubData';
import { CATEGORY_STYLES } from '../constants/eventStyles';
import { getBrandLogo } from '../constants/brandLogos';

export default function MediaLibrary() {
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const { data: eventHubData } = useEventHubData();

  const allPhotos = useMemo(() => {
    return eventHubData
      .flatMap((brand) =>
        (brand.events || [])
          .filter((e) => {
            if (!e.image || typeof e.image !== 'string') return false;
            const img = e.image.toLowerCase();
            if (
              img.includes('chibi') ||
              img.includes('mascot') ||
              img.includes('avatar') ||
              img.includes('placeholder') ||
              img.includes('sprite') ||
              (img.includes('logo') && !img.includes('banner'))
            ) {
              return false;
            }
            if (e.date && e.date < '2025-01-01') return false;
            return true;
          })
          .map((e) => ({
            id: `${brand.id}-${e.id}`,
            title: e.title,
            desc: e.desc,
            image: e.image,
            date: e.date,
            time: e.time,
            type: e.type,
            url: e.url,
            brandId: brand.id,
            brandName: brand.name,
            brandLogo: getBrandLogo(brand.id, brand.name, brand.logo),
          }))
      )
      .sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA);
      });
  }, [eventHubData]);

  const filteredPhotos = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allPhotos.filter((item) => {
      const matchSegment =
        selectedSegment === 'all' ||
        (selectedSegment === 'minhtuan' && item.brandId === 'minhtuan') ||
        (selectedSegment === 'competitors' && item.brandId !== 'minhtuan');

      const matchType = selectedType === 'all' || item.type === selectedType;
      const matchSearch =
        q === '' ||
        item.title.toLowerCase().includes(q) ||
        item.brandName.toLowerCase().includes(q);

      return matchSegment && matchType && matchSearch;
    });
  }, [allPhotos, selectedSegment, selectedType, searchQuery]);

  const groupedPhotos = useMemo(() => {
    const groupsMap = new Map();
    filteredPhotos.forEach((photo) => {
      const parts = (photo.date || '2026-01-01').split('-');
      const y = parts[0] || '2026';
      const m = parts[1] || '01';
      const groupKey = `Tháng ${Number(m)}, ${y}`;
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, []);
      }
      groupsMap.get(groupKey).push(photo);
    });

    const result = {};
    for (const [key, list] of groupsMap.entries()) {
      result[key] = list;
    }
    return result;
  }, [filteredPhotos]);

  const currentPhoto = activeIndex !== null ? filteredPhotos[activeIndex] : null;

  const handleNext = (e) => {
    e?.stopPropagation();
    if (activeIndex < filteredPhotos.length - 1) setActiveIndex(activeIndex + 1);
  };

  const handlePrev = (e) => {
    e?.stopPropagation();
    if (activeIndex > 0) setActiveIndex(activeIndex - 1);
  };

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-slate-50 text-slate-800 select-none overflow-hidden font-sans">
      
      <div className="p-3 sm:p-4 lg:p-6 bg-slate-50 shrink-0 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Thư viện ảnh</h1>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Kho lưu trữ hình ảnh và banner chiến dịch của toàn bộ hệ thống</p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60 sm:flex-initial lg:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm thương hiệu, sự kiện..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-blue-500 shadow-2xs transition"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
          <div className="inline-flex p-1 bg-slate-200/70 rounded-xl">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'minhtuan', label: 'Nội bộ' },
              { id: 'competitors', label: 'Đối thủ' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedSegment(tab.id)}
                className={`px-3 sm:px-3.5 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  selectedSegment === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full">
            {[
              { id: 'all', label: 'Tất cả danh mục' },
              { id: 'promo', label: 'Khuyến mãi' },
              { id: 'release', label: 'Ra mắt' },
              { id: 'live', label: 'Livestream' },
              { id: 'ads', label: 'Quảng cáo' },
              { id: 'internal', label: 'Nội bộ' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedType(cat.id)}
                className={`h-7 px-2.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-medium transition cursor-pointer shrink-0 ${
                  selectedType === cat.id
                    ? 'bg-blue-50 text-blue-600 font-semibold border border-blue-200'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60 shadow-2xs'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 pb-6 space-y-5 sm:space-y-6">
        {Object.keys(groupedPhotos).length > 0 ? (
          Object.entries(groupedPhotos).map(([groupTitle, photos]) => (
            <div key={groupTitle} className="space-y-2.5 sm:space-y-3">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900">{groupTitle}</h2>
                <span className="text-[11px] sm:text-xs font-medium text-slate-500">{photos.length} ảnh</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-2.5">
                {photos.map((item) => {
                  const globalIdx = filteredPhotos.findIndex((p) => p.id === item.id);
                  const style = CATEGORY_STYLES[item.type] || CATEGORY_STYLES.promo;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveIndex(globalIdx)}
                      className="group relative aspect-square bg-slate-200 rounded-xl overflow-hidden cursor-pointer border border-slate-200/80 shadow-2xs hover:border-blue-400 transition"
                    >
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300 ease-out"
                        loading="lazy"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 sm:p-2.5 flex flex-col justify-between">
                        <div className="flex justify-end">
                          <span className={`w-2 h-2 rounded-full ${style.dot} ring-2 ring-white`} />
                        </div>
                        <div>
                          <div className="text-[10px] sm:text-[11px] font-bold text-white truncate drop-shadow-xs">
                            {item.brandName}
                          </div>
                          <div className="text-[9px] sm:text-[10px] text-white/80 line-clamp-1">
                            {item.title}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-72 sm:h-80 text-slate-400">
            <Sparkles size={36} className="stroke-1 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-700">Không tìm thấy hình ảnh nào</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Vui lòng thử lại với từ khóa hoặc danh mục khác</p>
          </div>
        )}
      </div>

      {currentPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-150">
          
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 text-white shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              {currentPhoto.brandLogo && (
                <img
                  src={currentPhoto.brandLogo}
                  alt={currentPhoto.brandName}
                  className="w-6 h-6 object-contain rounded-full bg-white p-0.5 shrink-0"
                />
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold leading-tight truncate">{currentPhoto.brandName}</div>
                <div className="text-[10px] text-white/60">{currentPhoto.date}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <button
                onClick={() => setShowInfoPanel(!showInfoPanel)}
                className={`p-2 rounded-full transition cursor-pointer ${
                  showInfoPanel ? 'bg-white/30 text-white' : 'hover:bg-white/15 text-white/80'
                }`}
                title="Thông tin chi tiết"
              >
                <Info size={18} />
              </button>
              <button
                onClick={() => setActiveIndex(null)}
                className="p-2 rounded-full hover:bg-white/15 text-white/80 transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
            {activeIndex > 0 && (
              <button
                onClick={handlePrev}
                className="absolute left-2 sm:left-6 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition backdrop-blur-md cursor-pointer z-10"
              >
                <ChevronLeft size={20} className="sm:w-6 sm:h-6" />
              </button>
            )}

            <img
              src={currentPhoto.image}
              alt={currentPhoto.title}
              className="max-h-[60vh] sm:max-h-[75vh] max-w-full object-contain rounded-lg sm:rounded-xl shadow-2xl transition duration-200"
            />

            {activeIndex < filteredPhotos.length - 1 && (
              <button
                onClick={handleNext}
                className="absolute right-2 sm:right-6 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition backdrop-blur-md cursor-pointer z-10"
              >
                <ChevronRight size={20} className="sm:w-6 sm:h-6" />
              </button>
            )}
          </div>

          <div className="p-3 sm:p-4 bg-gradient-to-t from-black/90 to-transparent flex flex-col items-center">
            {showInfoPanel ? (
              <div className="max-w-xl w-full bg-[#1c1c1e] text-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-white/10 shadow-2xl space-y-2.5 sm:space-y-3 mb-2 animate-in slide-in-from-bottom-5 duration-150 max-h-[30vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_STYLES[currentPhoto.type]?.pill}`}>
                    {CATEGORY_STYLES[currentPhoto.type]?.label}
                  </span>
                  <div className="flex items-center gap-2.5 sm:gap-3 text-[10px] sm:text-xs text-white/60">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {currentPhoto.date}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {currentPhoto.time}</span>
                  </div>
                </div>

                <h3 className="text-xs sm:text-sm font-bold leading-snug">{currentPhoto.title}</h3>
                {currentPhoto.desc && <p className="text-[11px] sm:text-xs text-white/70 leading-relaxed">{currentPhoto.desc}</p>}

                {currentPhoto.url && (
                  <a
                    href={currentPhoto.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-[#2997ff] font-semibold hover:underline pt-1"
                  >
                    Xem bài viết gốc <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ) : (
              <div className="text-center text-[11px] sm:text-xs text-white/70 font-medium line-clamp-1 max-w-lg mb-1.5 sm:mb-2 px-4">
                {currentPhoto.title}
              </div>
            )}

            <div className="text-[10px] sm:text-[11px] font-semibold text-white/50 tracking-widest">
              {activeIndex + 1} / {filteredPhotos.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
