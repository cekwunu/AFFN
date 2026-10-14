import type { ReactNode } from 'react';

// Vendor area. Role check and area navigation are added with auth (AUTH-02).
export default function VendorLayout({ children }: { children: ReactNode }) {
  return <div data-area="vendor">{children}</div>;
}
