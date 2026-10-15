import type { ReactNode } from 'react';

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h1 className="font-display text-display-md font-semibold">{title}</h1>
        {intro && <p className="text-body text-muted-foreground">{intro}</p>}
      </div>
      {children}
      {footer && (
        <div className="grid gap-2 border-t border-border pt-6 text-body-sm">{footer}</div>
      )}
    </div>
  );
}
