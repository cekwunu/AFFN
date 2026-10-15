/** Badge colour per application status, shared by the admin and vendor views. */
export const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> =
  {
    draft: 'neutral',
    submitted: 'info',
    under_review: 'info',
    more_info_requested: 'warning',
    approved: 'success',
    rejected: 'danger',
    waitlisted: 'warning',
    withdrawn: 'neutral',
  };
