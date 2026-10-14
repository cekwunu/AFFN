import type { ReactNode } from 'react';

// Public pages: no login. Keep these light for 4G (NFR-01).
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div data-area="public">{children}</div>;
}
