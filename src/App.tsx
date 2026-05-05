import { useEffect, useState } from 'react';
import { RefreshCw, Linkedin, Instagram } from 'lucide-react';
import { useFollowers } from './hooks/useFollowers';
import { StatCard } from './components/StatCard';
import type { PlatformConfig } from './types';

const PLATFORMS: Record<'x' | 'instagram' | 'linkedin', PlatformConfig> = {
  x: {
    id: 'x',
    name: 'X',
    handle: 'khushiSharma_22',
    url: 'https://x.com/khushiSharma_22',
    iconBg: 'bg-black',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    handle: 'khushitech.ai',
    url: 'https://www.instagram.com/khushitech.ai/',
    iconBg: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600',
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    handle: 'khushisharma-22',
    url: 'https://www.linkedin.com/in/khushisharma-22',
    iconBg: 'bg-[#0A66C2]',
  },
};

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="white" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

function relTime(ms: number | null): string {
  if (!ms) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function App() {
  const { data, loading, error, lastFetched, refresh } = useFollowers();
  const [, force] = useState(0);

  // Re-render every 10 s so the relative timestamp stays fresh
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const cacheState = error
    ? { dot: 'bg-red-500', label: 'Connection error' }
    : data?.servedFromCache
      ? { dot: 'bg-amber-500', label: 'Cached (≤2 min old)' }
      : data
        ? { dot: 'bg-emerald-500', label: 'Live' }
        : { dot: 'bg-zinc-400', label: 'Loading' };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* iOS-style large title with frosted blur */}
      <header className="sticky top-0 z-10 border-b border-zinc-200/60 bg-zinc-50/80 backdrop-blur-xl dark:border-zinc-900 dark:bg-black/80">
        <div className="mx-auto max-w-md px-5 pt-[env(safe-area-inset-top)]">
          <div className="flex items-end justify-between pb-3 pt-3">
            <div>
              <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
                Khushi Sharma
              </p>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">
                Followers
              </h1>
            </div>
            <button
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-white transition-transform active:scale-90 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <RefreshCw
                className={`h-4 w-4 text-zinc-700 dark:text-zinc-300 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5">
        {/* Cache status pill */}
        <div className="mb-5 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${cacheState.dot}`} />
            <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              {cacheState.label}
            </span>
          </div>
          <span className="text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">
            Updated {relTime(lastFetched)}
          </span>
        </div>

        <div className="space-y-3">
          <StatCard
            config={PLATFORMS.x}
            count={data?.x ?? null}
            loading={loading}
            icon={<XIcon />}
          />
          <StatCard
            config={PLATFORMS.instagram}
            count={data?.instagram ?? null}
            loading={loading}
            icon={<Instagram className="h-5 w-5 text-white" />}
          />
          <StatCard
            config={PLATFORMS.linkedin}
            count={data?.linkedin ?? null}
            loading={loading}
            icon={<Linkedin className="h-5 w-5 text-white" fill="white" />}
          />
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200/50 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-950/30">
            <p className="text-[13px] text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
          Auto-refreshes every 2 minutes
        </p>
      </main>
    </div>
  );
}