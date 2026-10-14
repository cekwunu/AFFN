import type { ReactNode } from 'react';

// Admin area. Role check and area navigation are added with auth (AUTH-02).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div data-area="admin">{children}</div>;
}
