import { useState } from 'react';

/**
 * Trạng thái popup của một tab Cài đặt: popup nào đang mở, đối tượng đang sửa, dữ liệu form,
 * đang lưu, lỗi. run(): chạy thao tác lưu; thành công thì đóng popup. Lỗi kiểm tra dữ liệu
 * (ValidationError) thì giữ popup mở và hiện lỗi; lỗi khác báo qua onError rồi đóng.
 */
export class ValidationError extends Error {}

export function useModalState() {
  const [mode, setMode] = useState(null);
  const [item, setItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const open = (nextMode, nextItem = null, form = {}) => {
    setError('');
    setMode(nextMode);
    setItem(nextItem);
    setFormData(form);
  };
  const close = () => {
    setError('');
    setMode(null);
    setItem(null);
    setFormData({});
  };
  const run = async (action, onError) => {
    setSaving(true);
    setError('');
    try {
      await action();
      close();
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Thao tác thất bại.';
      if (err instanceof ValidationError) setError(message);
      else {
        onError?.(message, 'error');
        close();
      }
    } finally {
      setSaving(false);
    }
  };

  return { mode, item, formData, setFormData, error, saving, open, close, run };
}
