import type { ReactNode } from 'react';
import { PortalShell } from '@/components/shells/portal-shell';

// Admin area. Role check and area navigation are added with auth (AUTH-02).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PortalShell area="admin">{children}</PortalShell>;
}
