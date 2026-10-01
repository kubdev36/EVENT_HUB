import React from 'react';
import { Users, Plus, KeyRound, Edit2, Trash2 } from 'lucide-react';

export default function UsersTab({
  users = [],
  onAddUser,
  onEditUser,
  onDeleteUser,
  onResetPassword,
}) {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="p-3 sm:p-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">Danh sách tài khoản ({users.length})</span>
        <button
          onClick={onAddUser}
          className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
        >
          <Plus size={14} />
          <span className="hidden xs:inline">Thêm nhân viên</span>
        </button>
      </div>

      <div className="divide-y divide-slate-100 text-xs">
        {users.map((u) => (
          <div
            key={u.id}
            className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50 transition"
          >
            <div className="min-w-0">
              <div className="font-bold text-slate-900 truncate">{u.name}</div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5">
                {u.email} • {u.department?.toUpperCase() || 'MKT'}
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  u.role === 'Admin'
                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {u.role}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onResetPassword(u)}
                  title="Reset mật khẩu"
                  className="p-1.5 text-slate-400 hover:text-orange-600 rounded cursor-pointer"
                >
                  <KeyRound size={14} />
                </button>
                <button
                  onClick={() => onEditUser(u)}
                  title="Sửa"
                  className="p-1.5 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => onDeleteUser(u)}
                  title="Xóa"
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
