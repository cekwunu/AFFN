import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Section({
  id,
  title,
  intro,
  children,
  className,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-24 border-t border-border py-16', className)}
    >
      <div className="mb-10 grid max-w-2xl gap-3">
        <h2 id={`${id}-title`} className="font-display text-display-md font-semibold">
          {title}
        </h2>
        {intro && <p className="text-body-lg text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export function Demo({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="grid gap-4">
      <h3 className="text-heading-sm font-semibold">{title}</h3>
      <div className={cn('rounded-xl border border-border bg-card p-6', className)}>{children}</div>
    </div>
  );
}
