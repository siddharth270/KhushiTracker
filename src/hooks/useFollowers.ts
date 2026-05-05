import { useCallback, useEffect, useRef, useState } from 'react';
import type { FollowerResponse } from '../types';

const POLL_MS = 120_000; // 2 min — matches backend cache window
const ENDPOINT = '/.netlify/functions/getFollowers';

interface State {
  data: FollowerResponse | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

export function useFollowers() {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
    lastFetched: null,
  });

  // Coalesce concurrent fetches (e.g. tap refresh while a poll is in flight)
  const inflight = useRef<Promise<void> | null>(null);

  const fetchData = useCallback(async () => {
    if (inflight.current) return inflight.current;

    setState((s) => ({ ...s, loading: true, error: null }));

    const p = (async () => {
      try {
        const res = await fetch(ENDPOINT, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: FollowerResponse = await res.json();
        setState({ data, loading: false, error: null, lastFetched: Date.now() });
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Network error',
        }));
      }
    })();

    inflight.current = p;
    try {
      await p;
    } finally {
      inflight.current = null;
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, POLL_MS);

    // iOS PWAs aggressively suspend timers when backgrounded — re-fetch on resume
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchData]);

  return { ...state, refresh: fetchData };
}