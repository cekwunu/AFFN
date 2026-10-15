'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { PayState } from '@/app/[locale]/(vendor)/vendor/stall/actions';
import { buttonVariants } from '@/components/ui/button-variants';

function Submit({ label, working }: { label: string; working: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={buttonVariants({ size: 'lg' })}
    >
      {pending ? working : label}
    </button>
  );
}

/** "Pay the stall fee": opens the provider's payment link (STL-04). */
export function PayStallFee({
  action,
  stallFeeId,
  labels,
}: {
  action: (state: PayState, formData: FormData) => Promise<PayState>;
  stallFeeId: string;
  labels: { pay: string; paying: string; failed: string };
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="grid justify-items-start gap-2">
      <input type="hidden" name="stallFeeId" value={stallFeeId} />
      <Submit label={labels.pay} working={labels.paying} />
      {state.error && (
        <p role="alert" className="text-body-sm font-medium text-danger">
          {labels.failed}
        </p>
      )}
    </form>
  );
}
