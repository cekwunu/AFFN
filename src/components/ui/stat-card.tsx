import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface StatDelta {
  /** Visible text, e.g. "+12 % fra i går". Must make sense when read aloud. */
  label: string;
  trend: 'up' | 'down' | 'flat';
  /** Whether the change is good news; colours the delta. Defaults from the trend. */
  tone?: 'positive' | 'negative' | 'neutral';
}

export function StatCard({
  label,
  value,
  delta,
  caption,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: StatDelta;
  caption?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const tone =
    delta?.tone ??
    (delta?.trend === 'up' ? 'positive' : delta?.trend === 'down' ? 'negative' : 'neutral');
  const TrendIcon =
    delta?.trend === 'up' ? ArrowUpRight : delta?.trend === 'down' ? ArrowDownRight : ArrowRight;

  return (
    <div
      data-slot="stat-card"
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span className="text-muted-foreground [&_svg]:size-5" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <p className="font-display text-display-md font-semibold tabular-nums">{value}</p>
      {(delta || caption) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold',
                tone === 'positive' && 'bg-success-subtle text-success-subtle-foreground',
                tone === 'negative' && 'bg-danger-subtle text-danger-subtle-foreground',
                tone === 'neutral' && 'bg-muted text-foreground',
              )}
            >
              <TrendIcon className="size-3.5" aria-hidden="true" />
              {delta.label}
            </span>
          )}
          {caption && <span className="text-muted-foreground">{caption}</span>}
        </div>
      )}
    </div>
  );
}
