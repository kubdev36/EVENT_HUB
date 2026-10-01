import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function UserModal({
  isOpen,
  mode, // 'add' | 'edit' | 'reset-pass'
  selectedUser,
  departmentsList = [],
  formData,
  setFormData,
  onClose,
  onSave,
  saving = false,
}) {
  if (!isOpen) return null;

  const isReset = mode === 'reset-pass';
  const isAdd = mode === 'add';

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-blue-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
          <div className="text-xs font-bold uppercase tracking-wider">
            {isReset ? 'Reset mật khẩu' : isAdd ? 'Thêm nhân viên mới' : 'Chỉnh sửa tài khoản'}
          </div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          {isReset ? (
            <div className="space-y-2 py-1">
              <div className="text-slate-600">
                ĐẶT LẠI MẬT KHẨU CHO: <span className="font-bold text-slate-900">{selectedUser?.name}</span>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Mật khẩu mới mặc định:</label>
                <input
                  type="text"
                  defaultValue="EventHub@2026"
                  className="w-full h-8.5 rounded-lg border border-slate-200 px-3 font-mono text-slate-700 bg-slate-50"
                  readOnly
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Họ và tên:</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nguyễn Văn A"
                  className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Email:</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@company.com"
                  className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Mật khẩu:</label>
                <input
                  type="text"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={isAdd ? 'Nhập mật khẩu tài khoản' : 'Để trống nếu không đổi'}
                  className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Phòng ban:</label>
                  <select
                    value={formData.department || departmentsList[0]?.code || 'mkt'}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full h-8.5 rounded-lg border border-slate-200 px-2 outline-none bg-white cursor-pointer"
                  >
                    {departmentsList.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Quyền hạn:</label>
                  <select
                    value={formData.role || 'Staff'}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full h-8.5 rounded-lg border border-slate-200 px-2 outline-none bg-white cursor-pointer"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              </div>
            </>
          )}

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
              {saving ? 'Đang lưu...' : isReset ? 'Xác nhận reset' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
