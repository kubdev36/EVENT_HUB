import { useEffect, useMemo, useState } from 'react';
import { eventsApi } from './API';
import { getBrandLogo } from '../constants/brandLogos';

const normalizeEvent = (event) => ({
  id: event.id,
  date: event.date || '',
  time: event.time || '',
  type: event.type || 'release',
  title: event.title || '',
  fullTitle: event.fullTitle || event.title || '',
  desc: event.desc || '',
  image: event.image || '',
  url: event.url || '',
});

export function useEventHubData(limit = 500) {
  const [payload, setPayload] = useState({ sources: [], events: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await eventsApi.overview(limit);
        if (!active) return;
        setPayload(response.data || { sources: [], events: [] });
      } catch (err) {
        if (!active) return;
        setError(err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [limit, tick]);

  const data = useMemo(() => {
    return (payload.sources || []).map((source) => ({
      ...source,
      logo: getBrandLogo(source.id, source.name, source.logo),
      events: (source.events || []).map(normalizeEvent),
    }));
  }, [payload]);

  return {
    data,
    events: payload.events || [],
    isLoading,
    error,
    refetch,
    isUsingFallback: false,
  };
}
