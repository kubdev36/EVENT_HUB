import { useContext } from 'react';
import { FilterContext } from './filterContextObject';

/** Bộ lọc dùng chung; ngoài FilterProvider thì trả mặc định (hiện tất cả). */
export function useFilterContext() {
  const context = useContext(FilterContext);
  if (!context) {
    return {
      checkedFilters: { all: true, mkt: true, sale: true, competitor: true, internal: true },
      toggleFilter: () => {},
      isEventVisible: () => true,
    };
  }
  return context;
}
