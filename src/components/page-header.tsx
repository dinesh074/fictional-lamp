import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const ACCENTS = {
  indigo: 'from-indigo-500 via-purple-500 to-pink-500',
  blue: 'from-sky-500 via-blue-500 to-indigo-500',
  emerald: 'from-emerald-500 via-teal-500 to-cyan-500',
  amber: 'from-amber-500 via-orange-500 to-rose-500',
  rose: 'from-rose-500 via-pink-500 to-fuchsia-500',
  slate: 'from-slate-700 via-slate-600 to-slate-500',
} as const;

export type PageHeaderAccent = keyof typeof ACCENTS;

/**
 * Reusable colorful page header with a gradient background, an optional icon,
 * subtitle and right-aligned actions slot.
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  accent = 'indigo',
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  accent?: PageHeaderAccent;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-5 sm:p-6 text-white shadow-md bg-gradient-to-r',
        ACCENTS[accent],
        'flex flex-wrap items-center justify-between gap-3',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="shrink-0 rounded-lg bg-white/15 p-2 backdrop-blur">
            <Icon className="size-6" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold truncate">{title}</h1>
          {subtitle && <p className="text-sm text-white/90 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

