import { useEffect, useMemo, useState } from 'react';
import { eventsApi } from './API';
import { getBrandLogo } from '../constants/brandLogos';

export function useEventsByDate(date) {
  const [payload, setPayload] = useState({ sources: [], totalEvents: 0, totalSources: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const response = await eventsApi.byDate(date || undefined);
        if (!active) return;
        setPayload(response.data || { sources: [], totalEvents: 0, totalSources: 0 });
      } finally {
        if (active) setIsLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [date, tick]);

  const sources = useMemo(() => {
    return (payload.sources || []).map((source) => ({
      ...source,
      logo: getBrandLogo(source.id, source.name, source.logo),
    }));
  }, [payload]);

  return {
    ...payload,
    sources,
    isLoading,
    refetch,
  };
}
