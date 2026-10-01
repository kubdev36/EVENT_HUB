import React from 'react';

export default function KeywordsTab({
  keywordRules = [],
  onEditKeyword,
}) {
  return (
    <div className="space-y-3 w-full">
      <h2 className="text-xs font-bold text-slate-700">Luật phân loại tự động</h2>
      <div className="space-y-2.5 w-full">
        {keywordRules.map((rule, idx) => (
          <div
            key={idx}
            className="w-full bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-2xs space-y-1.5 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-800">
                {rule.label} ({rule.type})
              </span>
              <button
                onClick={() => onEditKeyword(rule, idx)}
                className="text-blue-600 hover:underline font-semibold cursor-pointer text-[11px] shrink-0"
              >
                Sửa từ khóa
              </button>
            </div>
            <div className="w-full p-2 sm:p-2.5 rounded bg-slate-50 border border-slate-100 font-mono text-[10px] sm:text-[11px] text-slate-600 break-words">
              {rule.keywords}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
