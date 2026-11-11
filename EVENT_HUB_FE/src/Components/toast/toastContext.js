import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/** toast.success(msg), toast.error(msg), hoặc toast.show(msg, type). Cần ToastProvider ở gốc app. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast phải dùng bên trong ToastProvider');
  return ctx;
}
