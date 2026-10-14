import { use } from 'react';
import { PublicShell } from '@/components/shells/public-shell';
import { initRequestLocale } from '@/i18n/server';

// Public pages: no login. Keep these light for 4G (NFR-01).
export default function PublicLayout({ children, params }: LayoutProps<'/[locale]'>) {
  // Layouts render independently of pages; set the locale here too so the shell's
  // translations don't fall back to headers() and make every public page dynamic.
  initRequestLocale(use(params).locale);
  return <PublicShell>{children}</PublicShell>;
}
