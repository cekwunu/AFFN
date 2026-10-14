import type { ReactNode } from 'react';

// Sponsor area. Role check and area navigation are added with auth (AUTH-02).
export default function SponsorLayout({ children }: { children: ReactNode }) {
  return <div data-area="sponsor">{children}</div>;
}
