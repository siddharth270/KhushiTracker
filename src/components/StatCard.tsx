import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { PlatformConfig } from '../types';

interface Props {
  config: PlatformConfig;
  count: number | null;
  loading: boolean;
  icon: ReactNode;
}

export function StatCard({ config, count, loading, icon }: Props) {
  return (
    <a
      href={config.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] transition-transform duration-150 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${config.iconBg}`}>
          {icon}
        </div>
        <ExternalLink className="h-4 w-4 text-zinc-400 dark:text-zinc-600" />
      </div>

      <div className="space-y-0.5">
        <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">{config.name}</p>
        <p className="truncate text-[15px] text-zinc-900 dark:text-zinc-200">@{config.handle}</p>
      </div>

      <div className="mt-5">
        {loading && count === null ? (
          <div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : count === null ? (
          <p className="text-[34px] font-bold leading-none tabular-nums text-zinc-300 dark:text-zinc-700">
            —
          </p>
        ) : (
          <p className="text-[34px] font-bold leading-none tabular-nums text-zinc-900 dark:text-white">
            {count.toLocaleString()}
          </p>
        )}
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
          Followers
        </p>
      </div>
    </a>
  );
}