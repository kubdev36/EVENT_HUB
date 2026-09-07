import React, { createContext, useContext, useState } from 'react';

const FilterContext = createContext();

export function FilterProvider({ children }) {
  const [checkedFilters, setCheckedFilters] = useState({
    all: true,
    mkt: true,
    sale: true,
    competitor: true,
    internal: true,
  });

  const toggleFilter = (id) => {
    setCheckedFilters((prev) => {
      if (id === 'all') {
        const nextAll = !prev.all;
        return {
          all: nextAll,
          mkt: nextAll,
          sale: nextAll,
          competitor: nextAll,
          internal: nextAll,
        };
      }

      const next = { ...prev, [id]: !prev[id] };
      const allOthersChecked = next.mkt && next.sale && next.competitor && next.internal;
      next.all = allOthersChecked;
      return next;
    });
  };

  const isEventVisible = (event) => {
    if (checkedFilters.all) return true;

    const type = (event.type || '').toLowerCase();
    const origin = (event.origin || 'crawler').toLowerCase();

    // If none of the specific filters are checked, hide all
    if (!checkedFilters.mkt && !checkedFilters.sale && !checkedFilters.competitor && !checkedFilters.internal) {
      return false;
    }

    let matches = false;

    if (checkedFilters.mkt && ['release', 'promo', 'ads', 'live', 'marketing'].includes(type)) {
      matches = true;
    }
    if (checkedFilters.sale && ['sale', 'promo'].includes(type)) {
      matches = true;
    }
    if (checkedFilters.competitor && (origin === 'crawler' || !origin)) {
      matches = true;
    }
    if (checkedFilters.internal && (origin === 'manual' || type === 'internal')) {
      matches = true;
    }

    return matches;
  };

  return (
    <FilterContext.Provider value={{ checkedFilters, setCheckedFilters, toggleFilter, isEventVisible }}>
      {children}
    </FilterContext.Provider>
  );
}

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
