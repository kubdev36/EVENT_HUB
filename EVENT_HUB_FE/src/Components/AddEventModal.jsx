import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Image, Link, Tag, Building2, Plus, Loader2 } from 'lucide-react';
import { eventsApi, settingsApi } from '../API/API';

const FALLBACK_BRAND_OPTIONS = [
  { id: 'minhtuan', name: 'Minh Tuấn Mobile' },
  { id: 'cellphones', name: 'CellphoneS' },
  { id: 'hoangha', name: 'Hoàng Hà Mobile' },
  { id: 'fptshop', name: 'FPT Shop' },
  { id: 'tgdd', name: 'Thế Giới Di Động' },
  { id: 'nguyenkim', name: 'Nguyễn Kim' },
];

const TYPE_OPTIONS = [
  { id: 'promo', label: 'Khuyến mãi' },
  { id: 'release', label: 'Ra mắt sản phẩm' },
  { id: 'live', label: 'Livestream' },
  { id: 'ads', label: 'Quảng cáo' },
  { id: 'internal', label: 'Sự kiện nội bộ' },
];

export default function AddEventModal({ onClose, onSuccess, defaultBrandId = 'minhtuan', defaultType = 'promo' }) {
  const [brandOptions, setBrandOptions] = useState(FALLBACK_BRAND_OPTIONS);
  const [sourceId, setSourceId] = useState(defaultBrandId);
  const [type, setType] = useState(defaultType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [eventTime, setEventTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [image, setImage] = useState('');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    settingsApi
      .getCrawlerSources()
      .then((res) => {
        const sources = res?.data?.sources || res?.data;
        if (Array.isArray(sources) && sources.length > 0) {
          const formatted = sources.map((s) => ({ id: s.id, name: s.name }));
          const merged = [...formatted];
          FALLBACK_BRAND_OPTIONS.forEach((fb) => {
            if (!merged.some((m) => m.id === fb.id)) {
              merged.push(fb);
            }
          });
          setBrandOptions(merged);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề sự kiện.');
      return;
    }

    setIsLoading(true);
    setError('');

    const selectedBrand = brandOptions.find((b) => b.id === sourceId);

    try {
      await eventsApi.create({
        sourceId,
        sourceName: selectedBrand ? selectedBrand.name : 'Minh Tuấn Mobile',
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        eventDate: eventDate ? `${eventDate}T00:00:00.000Z` : undefined,
        eventTime,
        image: image.trim() || undefined,
        url: url.trim() || undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Tạo sự kiện thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150 my-auto">
        <div className="flex items-center justify-between px-5 py-4 bg-blue-600 text-white">
          <div className="flex items-center gap-2">
            <Plus size={18} />
            <h2 className="text-sm sm:text-base font-bold">Thêm sự kiện mới</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Building2 size={14} className="text-blue-600" /> Thương hiệu / Đơn vị:
              </label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 bg-white"
              >
                {brandOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Tag size={14} className="text-blue-600" /> Phân loại sự kiện:
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 bg-white"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Tiêu đề sự kiện (*):</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Chương trình Flash Sale Giảm 50% iPhone 16 Pro Max..."
              className="w-full h-9 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar size={14} className="text-blue-600" /> Ngày tổ chức:
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock size={14} className="text-blue-600" /> Giờ bắt đầu:
              </label>
              <input
                type="text"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                placeholder="14:00"
                className="w-full h-9 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Image size={14} className="text-blue-600" /> Ảnh Banner / Thumbnail URL:
            </label>
            <input
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://..."
              className="w-full h-9 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px]"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Link size={14} className="text-blue-600" /> Đường dẫn chi tiết bài viết (URL):
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full h-9 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px]"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Mô tả sự kiện:</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập chi tiết nội dung chương trình..."
              className="w-full rounded-lg border border-slate-200 p-2.5 outline-none focus:border-blue-500 text-xs leading-relaxed"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>Lưu sự kiện</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
