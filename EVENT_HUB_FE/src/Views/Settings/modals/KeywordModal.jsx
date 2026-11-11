import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { COLOR_NAMES, COLOR_STYLES, suggestTypeCode } from '../../../constants/eventTypes';

/** Thêm loại mới hoặc sửa tên, màu, từ khóa của loại có sẵn. Mã loại chỉ đặt khi thêm. */
export default function KeywordModal({
  isOpen,
  mode = 'edit',
  formData,
  setFormData,
  onClose,
  onSave,
  saving = false,
  error = '',
}) {
  if (!isOpen) return null;
  const isAdd = mode === 'add';
  const set = (patch) => setFormData({ ...formData, ...patch });

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
          <div className="text-xs font-bold uppercase tracking-wider">
            {isAdd ? 'Thêm loại phân loại' : 'Sửa loại phân loại'}
          </div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Tên loại:</label>
              <input
                value={formData.label || ''}
                onChange={(e) =>
                  set(
                    isAdd && !formData.typeEdited
                      ? { label: e.target.value, type: suggestTypeCode(e.target.value) }
                      : { label: e.target.value }
                  )
                }
                placeholder="Trả góp"
                className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Mã loại:</label>
              <input
                value={formData.type || ''}
                onChange={(e) => set({ type: e.target.value.toLowerCase(), typeEdited: true })}
                readOnly={!isAdd}
                title={isAdd ? 'Chữ thường không dấu, số và "_"' : 'Không đổi được mã của loại đã có'}
                placeholder="tra_gop"
                className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px] read-only:bg-slate-50 read-only:text-slate-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Màu hiển thị:</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_NAMES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ color: c })}
                  aria-label={`Màu ${c}`}
                  aria-pressed={formData.color === c}
                  className={`w-6 h-6 rounded-full flex items-center justify-center cursor-pointer ring-offset-1 ${COLOR_STYLES[c].dot} ${
                    formData.color === c ? 'ring-2 ring-slate-700' : ''
                  }`}
                >
                  {formData.color === c && <Check size={12} className="text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Danh sách từ khóa (cách nhau bởi dấu phẩy):</label>
            <textarea
              rows={4}
              value={formData.keywords || ''}
              onChange={(e) => set({ keywords: e.target.value })}
              placeholder="tra gop, tra gop 0%, lai suat 0"
              className="w-full rounded-lg border border-slate-200 p-2.5 outline-none font-mono text-[11px] leading-relaxed focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400">
              Bài được xếp vào loại đầu tiên (theo thứ tự trong danh sách) có từ khóa khớp tiêu đề hoặc mô tả.
            </p>
          </div>

          {error && <p className="text-[11px] text-rose-600">{error}</p>}

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
              {saving ? 'Đang lưu...' : isAdd ? 'Thêm loại' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
