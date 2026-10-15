'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { PayoutState } from '@/app/[locale]/(vendor)/vendor/payouts/actions';
import { buttonVariants } from '@/components/ui/button-variants';

function Submit({ label }: { label: string }) {
  const t = useTranslations('Payouts');
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={buttonVariants({ size: 'lg' })}
    >
      {pending ? t('starting') : label}
    </button>
  );
}

/** "Set up payouts": opens the provider's hosted onboarding (VEN-06). */
export function StartPayouts({
  action,
  label,
}: {
  action: () => Promise<PayoutState>;
  label: string;
}) {
  const t = useTranslations('Payouts');
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="grid justify-items-start gap-2">
      <Submit label={label} />
      {state.error && (
        <p role="alert" className="text-body-sm font-medium text-danger">
          {state.error === 'notApproved' ? t('notApproved') : t('failed')}
        </p>
      )}
    </form>
  );
}
