import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/link';

export interface ProgressStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
  /** Steps before the first unfinished one (or done) can be opened. */
  reachable: boolean;
}

/**
 * Where the vendor is in the application. Phones get "Step 3 of 7" and a bar; wider screens get
 * the whole list, with finished steps as links.
 */
export function ApplicationProgress({
  steps,
  current,
  label,
  stepOf,
}: {
  steps: ProgressStep[];
  current: number;
  label: string;
  stepOf: string;
}) {
  const percent = Math.round(((current + 1) / steps.length) * 100);
  return (
    <nav aria-label={label} className="grid gap-3">
      <div className="grid gap-2 md:hidden">
        <p className="flex items-baseline justify-between gap-3 text-body-sm">
          <span className="font-semibold">{steps[current]?.label}</span>
          <span className="text-muted-foreground">{stepOf}</span>
        </p>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ol className="hidden grid-cols-7 gap-1 md:grid">
        {steps.map((step, index) => {
          const isCurrent = index === current;
          const content = (
            <>
              <span
                className={clsx(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-caption font-semibold',
                  step.done && !isCurrent && 'border-primary bg-primary text-primary-foreground',
                  isCurrent && 'border-primary bg-card text-primary',
                  !step.done && !isCurrent && 'border-input text-muted-foreground',
                )}
              >
                {step.done && !isCurrent ? (
                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="text-center text-caption leading-tight break-words">
                {step.label}
              </span>
            </>
          );
          const classes = clsx(
            'flex min-h-11 flex-col items-center gap-1.5 rounded-md px-1 py-1.5',
            isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground',
          );
          return (
            <li key={step.key} className="min-w-0" aria-current={isCurrent ? 'step' : undefined}>
              {step.reachable && !isCurrent ? (
                <Link
                  href={step.href}
                  className={clsx(classes, 'hover:bg-accent hover:text-foreground')}
                >
                  {content}
                </Link>
              ) : (
                <span className={classes}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
