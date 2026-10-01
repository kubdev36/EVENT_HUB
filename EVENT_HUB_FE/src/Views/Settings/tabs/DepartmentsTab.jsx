import React from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function DepartmentsTab({
  departmentsList = [],
  departmentRules = [],
  settingsSaving = false,
  onAddDepartment,
  onEditDepartment,
  onDeleteDepartment,
  onToggleDepartment,
  onSaveDepartmentRules,
}) {
  return (
    <div className="space-y-4 w-full">
      {/* 1. Quản lý danh sách phòng ban */}
      <div className="w-full bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Danh sách Phòng ban ({departmentsList.length})</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Quản lý các phòng ban trong công ty, phân quyền và hiển thị trên menu
            </p>
          </div>
          <button
            onClick={onAddDepartment}
            className="h-8.5 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs self-start sm:self-auto"
          >
            <Plus size={14} />
            <span>Thêm phòng ban</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {departmentsList.map((dept) => (
            <div
              key={dept.code}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 flex flex-col justify-between gap-2.5 transition"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">{dept.name}</span>
                  <span className="font-mono text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                    {dept.code}
                  </span>
                </div>
                {dept.desc && (
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{dept.desc}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-200/60">
                <button
                  onClick={() => onEditDepartment(dept)}
                  className="h-7 px-2.5 rounded text-blue-600 hover:bg-blue-50 font-semibold flex items-center gap-1 transition cursor-pointer text-[11px]"
                >
                  <Edit2 size={12} />
                  <span>Sửa</span>
                </button>
                <button
                  onClick={() => onDeleteDepartment(dept)}
                  className="h-7 px-2.5 rounded text-rose-600 hover:bg-rose-50 font-semibold flex items-center gap-1 transition cursor-pointer text-[11px]"
                >
                  <Trash2 size={12} />
                  <span>Xóa</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Phân loại nhãn sự kiện */}
      <div className="w-full bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Phân loại nhãn sự kiện theo Phòng ban</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Tích chọn để chia luồng sự kiện tương ứng cho từng phòng ban
            </p>
          </div>
          <button
            onClick={onSaveDepartmentRules}
            disabled={settingsSaving}
            className="h-8.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-2xs disabled:opacity-50 shrink-0 self-start sm:self-auto"
          >
            {settingsSaving ? 'Đang lưu...' : 'Lưu phân loại'}
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {departmentRules.map((rule) => {
            return (
              <div
                key={rule.type}
                className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/50 px-2 rounded-lg transition"
              >
                <div className="min-w-[180px]">
                  <span className="font-bold text-slate-800 text-xs sm:text-sm">{rule.label}</span>
                  <span className="ml-2 font-mono text-[10px] text-slate-400">({rule.type})</span>
                </div>
                <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
                  {departmentsList.map((dept) => {
                    const isChecked = (rule.departments || []).includes(dept.code);
                    return (
                      <label
                        key={dept.code}
                        className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium select-none text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleDepartment(rule.type, dept.code)}
                          className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                        />
                        <span>{dept.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
