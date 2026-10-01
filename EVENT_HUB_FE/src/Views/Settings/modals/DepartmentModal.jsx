import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function DepartmentModal({
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-blue-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
          <div className="text-xs font-bold uppercase tracking-wider">
            {isAdd ? 'Thêm phòng ban mới' : 'Chỉnh sửa phòng ban'}
          </div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">
              Tên phòng ban: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => {
                const name = e.target.value;
                const code =
                  isAdd && !formData.codeEdited
                    ? name
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/đ/g, 'd')
                        .replace(/[^a-z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .replace(/^_|_$/g, '')
                    : formData.code;
                setFormData({ ...formData, name, code });
              }}
              placeholder="VD: Chăm sóc khách hàng, Vận hành, Kỹ thuật..."
              className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">
              Mã định danh (Code / Slug): <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              disabled={!isAdd}
              value={formData.code || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                  codeEdited: true,
                })
              }
              placeholder="VD: cskh, van_hanh, ky_thuat"
              className={`w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none font-mono text-[11px] ${
                !isAdd ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'focus:border-blue-500'
              }`}
            />
            {isAdd && (
              <p className="text-[10px] text-slate-400">
                Dùng làm mã hệ thống và phân quyền nhân viên
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Mô tả / Chức năng:</label>
            <textarea
              rows={2}
              value={formData.desc || ''}
              onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
              placeholder="VD: Quản lý khách hàng, tiếp nhận thông tin..."
              className="w-full rounded-lg border border-slate-200 p-2 outline-none text-xs focus:border-blue-500"
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
