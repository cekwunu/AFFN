import type { ReactNode } from 'react';
import { PortalShell } from '@/components/shells/portal-shell';

// Sponsor area. Role check and area navigation are added with auth (AUTH-02).
export default function SponsorLayout({ children }: { children: ReactNode }) {
  return <PortalShell area="sponsor">{children}</PortalShell>;
}
