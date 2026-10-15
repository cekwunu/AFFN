import { Badge } from '@/components/ui/badge';
import type { SettlementStatus } from '@/lib/settlements/server';

const VARIANT: Record<SettlementStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  prepared: 'info',
  approved: 'info',
  releasing: 'warning',
  completed: 'success',
  completed_with_failures: 'danger',
  cancelled: 'neutral',
};

/** Draft → Ready for approval → Approved → Paying → Completed / Partially failed. */
export function SettlementBadge({ status, label }: { status: SettlementStatus; label: string }) {
  return (
    <Badge variant={VARIANT[status]} data-testid="settlement-status" data-status={status}>
      {label}
    </Badge>
  );
}
