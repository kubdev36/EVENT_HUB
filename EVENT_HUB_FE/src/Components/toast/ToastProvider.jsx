import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { ToastContext } from './toastContext';
import { addToast, removeToast, toastType, TOAST_DURATION } from './toastState';

const STYLES = {
  success: { box: 'border-emerald-200 bg-white', icon: <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> },
  error: { box: 'border-rose-200 bg-white', icon: <AlertTriangle size={16} className="text-rose-600 shrink-0" /> },
};

function ToastItem({ toast, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), TOAST_DURATION[toast.type]);
    return () => clearTimeout(timer);
  }, [toast.id, toast.type, onClose]);

  const style = STYLES[toast.type];
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-xl border shadow-lg shadow-slate-900/10 px-3 py-2.5 flex items-start gap-2.5 text-xs text-slate-700 ${style.box}`}
    >
      {style.icon}
      <span className="flex-1 leading-relaxed break-words">{toast.message}</span>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label="Đóng thông báo"
        className="p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Toast góc trên bên phải; tự ẩn sau vài giây, có nút đóng. */
export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const close = useCallback((id) => setToasts((list) => removeToast(list, id)), []);
  const show = useCallback((message, type) => {
    if (!message) return;
    nextId.current += 1;
    const toast = { id: nextId.current, message: String(message), type: toastType(type) };
    setToasts((list) => addToast(list, toast));
  }, []);

  const api = useMemo(
    () => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error') }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div aria-live="polite" className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={close} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
