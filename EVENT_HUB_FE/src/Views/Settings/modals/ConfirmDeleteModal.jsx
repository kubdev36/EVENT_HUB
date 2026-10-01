import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';

export default function ConfirmDeleteModal({
  isOpen,
  title = 'Xác nhận xóa',
  message,
  itemName,
  onClose,
  onConfirm,
  saving = false,
}) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-blue-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 bg-rose-600 text-white">
          <div className="text-xs font-bold uppercase tracking-wider">{title}</div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          <div className="flex items-start gap-3 py-2 text-slate-600">
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="font-bold text-slate-900">Bạn có chắc chắn muốn xóa?</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                {message || (
                  <>
                    Hành động này sẽ xóa vĩnh viễn <span className="font-semibold text-slate-800">{itemName}</span> khỏi hệ thống.
                  </>
                )}
              </div>
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
              onClick={onConfirm}
              disabled={saving}
              className="h-8.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shadow-xs disabled:opacity-50"
            >
              {saving ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
