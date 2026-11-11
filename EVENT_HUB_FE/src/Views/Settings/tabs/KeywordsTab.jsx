import { Plus, Trash2 } from 'lucide-react';
import { BUILTIN_TYPES, COLOR_STYLES } from '../../../constants/eventTypes';

export default function KeywordsTab({ keywordRules = [], onEditKeyword, onAddType, onDeleteType }) {
  return (
    <div className="space-y-3 w-full">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold text-slate-700">Luật phân loại tự động</h2>
        <button
          onClick={onAddType}
          className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Plus size={14} /> Thêm loại
        </button>
      </div>
      <div className="space-y-2.5 w-full">
        {keywordRules.map((rule, idx) => {
          const builtin = BUILTIN_TYPES.includes(rule.type);
          const color = COLOR_STYLES[rule.color] ?? null;
          return (
            <div
              key={rule.type || idx}
              className="w-full bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-2xs space-y-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 flex items-center gap-2 min-w-0">
                  {color && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.dot}`} />}
                  <span className="truncate">
                    {rule.label} ({rule.type})
                  </span>
                  {builtin && (
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">
                      Mặc định
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => onEditKeyword(rule, idx)}
                    className="text-blue-600 hover:underline font-semibold cursor-pointer text-[11px]"
                  >
                    Sửa
                  </button>
                  {!builtin && (
                    <button
                      onClick={() => onDeleteType(rule, idx)}
                      className="text-rose-600 hover:underline font-semibold cursor-pointer text-[11px] flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Xóa
                    </button>
                  )}
                </div>
              </div>
              <div className="w-full p-2 sm:p-2.5 rounded bg-slate-50 border border-slate-100 font-mono text-[10px] sm:text-[11px] text-slate-600 break-words">
                {rule.keywords || <span className="text-slate-400">(chưa có từ khóa)</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
