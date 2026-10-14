import type { ReactNode } from 'react';
import { PortalShell } from '@/components/shells/portal-shell';

// Platform area. Role check and area navigation are added with auth (AUTH-02).
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <PortalShell area="platform">{children}</PortalShell>;
}
