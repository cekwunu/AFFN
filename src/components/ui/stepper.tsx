import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Step {
  label: ReactNode;
  description?: ReactNode;
}

/** Progress through a multi-step flow. `current` is the 0-based active step. */
export function Stepper({
  steps,
  current,
  label,
  className,
}: {
  steps: Step[];
  current: number;
  label: string;
  className?: string;
}) {
  const t = useTranslations('Components.stepper');
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-col gap-4 md:flex-row md:gap-0">
        {steps.map((step, index) => {
          const status = index < current ? 'complete' : index === current ? 'current' : 'upcoming';
          return (
            <li
              key={index}
              aria-current={status === 'current' ? 'step' : undefined}
              className="group relative flex flex-1 items-start gap-3 md:flex-col md:pr-4"
            >
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-9 left-4 h-[calc(100%-1.5rem)] w-px md:top-4 md:left-10 md:h-px md:w-[calc(100%-3rem)]',
                    status === 'complete' ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-body-sm font-semibold',
                  status === 'complete' && 'border-primary bg-primary text-primary-foreground',
                  status === 'current' && 'border-primary bg-card text-primary',
                  status === 'upcoming' && 'border-input bg-card text-muted-foreground',
                )}
              >
                {status === 'complete' ? (
                  <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="grid gap-0.5">
                <span
                  className={cn(
                    'text-body-sm font-semibold',
                    status === 'upcoming' && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                  <span className="sr-only"> ({t(status)})</span>
                </span>
                {step.description && (
                  <span className="text-caption text-muted-foreground">{step.description}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
