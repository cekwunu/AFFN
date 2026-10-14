'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { buttonVariants } from '@/components/ui/button-variants';

/**
 * Switches between light and dark; until the user chooses, the theme follows the system.
 * Icon and label swap with CSS (`dark:`), so server and client markup always match.
 */
export function ThemeToggleButton({ toDark, toLight }: { toDark: string; toLight: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="dark:hidden" aria-hidden="true" />
      <Moon className="hidden dark:block" aria-hidden="true" />
      <span className="sr-only dark:hidden">{toDark}</span>
      <span className="sr-only hidden dark:inline">{toLight}</span>
    </button>
  );
}
