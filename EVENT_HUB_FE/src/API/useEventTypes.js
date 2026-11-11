import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from './API';
import { styleForType } from '../constants/eventTypes';

export const EVENT_TYPES_KEY = ['settings', 'event-types'];

/**
 * Loại sự kiện đang cấu hình (mã, tên, màu) từ GET /settings/event-types (nhân viên cũng gọi được).
 * styleOf(type): nhãn và màu để hiển thị; loại lạ hiện "Khác" màu xám.
 */
export function useEventTypes() {
  const q = useQuery({
    queryKey: EVENT_TYPES_KEY,
    queryFn: () => settingsApi.getEventTypes().then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 5 * 60_000,
  });
  const types = q.data ?? [];
  const styleOf = useCallback((type) => styleForType(type, q.data ?? []), [q.data]);
  return { types, styleOf, isLoading: q.isLoading, error: q.error };
}
