import type { ReactNode } from 'react';
import { PortalShell } from '@/components/shells/portal-shell';

// Vendor area. Role check and area navigation are added with auth (AUTH-02).
export default function VendorLayout({ children }: { children: ReactNode }) {
  return <PortalShell area="vendor">{children}</PortalShell>;
}
