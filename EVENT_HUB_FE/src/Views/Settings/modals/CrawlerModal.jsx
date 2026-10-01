import React from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Plus, Trash2, Image as ImageIcon } from 'lucide-react';

export default function CrawlerModal({
  isOpen,
  mode, // 'add' | 'edit'
  formData,
  setFormData,
  onClose,
  onSave,
  saving = false,
}) {
  if (!isOpen) return null;

  const isAdd = mode === 'add';

  const handleAddUrlField = () => {
    const urls = formData.targetUrls || [];
    setFormData({ ...formData, targetUrls: [...urls, ''] });
  };

  const handleUrlChange = (index, value) => {
    const urls = [...(formData.targetUrls || [])];
    urls[index] = value;
    setFormData({ ...formData, targetUrls: urls });
  };

  const handleRemoveUrlField = (index) => {
    const urls = [...(formData.targetUrls || [])];
    urls.splice(index, 1);
    setFormData({ ...formData, targetUrls: urls.length ? urls : [''] });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-blue-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
          <div className="text-xs font-bold uppercase tracking-wider">
            {isAdd ? 'Thêm đối thủ mới' : 'Chỉnh sửa Crawler'}
          </div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Tên đối thủ:</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="VD: CellphoneS, FPT Shop..."
              className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700">Logo đối thủ:</label>
            <div className="flex items-center gap-3">
              {formData.logo ? (
                <div className="relative group shrink-0">
                  <img
                    src={formData.logo}
                    alt="Logo preview"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/img/mtm.jpg';
                    }}
                    className="w-10 h-10 rounded-lg object-contain border border-slate-200 p-1 bg-white shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, logo: '' })}
                    className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 shadow-md hover:bg-rose-600 transition cursor-pointer"
                    title="Xóa logo"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                  <ImageIcon size={18} />
                </div>
              )}

              <label className="flex-1 cursor-pointer">
                <div className="h-8.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 text-blue-600 font-semibold px-3 flex items-center justify-center gap-2 transition text-xs select-none shadow-2xs">
                  <Upload size={14} />
                  <span>{formData.logo ? 'Thay đổi file logo (Browse...)' : 'Tải file logo từ máy (Browse...)'}</span>
                </div>
                <input
                  type="file"
                  accept="image/*,.htm,.html,*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      if (evt.target?.result) {
                        setFormData((prev) => ({ ...prev, logo: evt.target.result }));
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>

            <input
              type="text"
              value={formData.logo || ''}
              onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
              placeholder="Hoặc dán link URL logo (.png, .jpg, .htm, .html...)"
              className="w-full h-8 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px] mt-1"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700">Link RSS / Website theo dõi:</label>
              <button
                type="button"
                onClick={handleAddUrlField}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition cursor-pointer"
              >
                <Plus size={13} /> Thêm đường dẫn
              </button>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {(formData.targetUrls || ['']).map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => handleUrlChange(index, e.target.value)}
                    placeholder="https://..."
                    className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px]"
                  />
                  {formData.targetUrls?.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveUrlField(index)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer shrink-0"
                      title="Xóa đường dẫn này"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              onClick={onClose}
              className="h-8.5 px-3.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="h-8.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-xs disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
