'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast } from 'sonner';
import { useTranslations } from 'next-intl';

export { toast };

/** Toast outlet. Rendered once in the root layout; call `toast()` anywhere on the client. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  const t = useTranslations('Components');
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      containerAriaLabel={t('notifications')}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-start gap-3 rounded-lg border border-border bg-popover p-4 text-body-sm text-popover-foreground shadow-lg',
          title: 'font-semibold',
          description: 'text-muted-foreground',
          actionButton:
            'ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-primary px-3 text-caption font-medium text-primary-foreground',
          cancelButton:
            'inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-muted px-3 text-caption font-medium text-foreground',
          success: '[&_[data-icon]]:text-success',
          error: '[&_[data-icon]]:text-danger',
          warning: '[&_[data-icon]]:text-warning',
          info: '[&_[data-icon]]:text-info',
        },
      }}
    />
  );
}
