import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function KeywordModal({
  isOpen,
  formData,
  setFormData,
  onClose,
  onSave,
  saving = false,
}) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-blue-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
          <div className="text-xs font-bold uppercase tracking-wider">
            Sửa từ khóa phân loại
          </div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">
              Danh sách từ khóa (cách nhau bởi dấu phẩy):
            </label>
            <textarea
              rows={4}
              value={formData.keywords || ''}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              className="w-full rounded-lg border border-slate-200 p-2.5 outline-none font-mono text-[11px] leading-relaxed focus:border-blue-500"
            />
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
