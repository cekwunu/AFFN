'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

// Keep this minimal: everything here ships on every page, including public ones (NFR-01).
// Mount Toaster/Tooltip where they are used, not here.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
