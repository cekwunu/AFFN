import type { ReactNode } from 'react';

// Platform area. Role check and area navigation are added with auth (AUTH-02).
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <div data-area="platform">{children}</div>;
}
