'use client';

import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ROWS = [
  { name: 'duration-fast · ease-standard', className: 'duration-fast ease-standard' },
  { name: 'duration-base · ease-standard', className: 'duration-base ease-standard' },
  { name: 'duration-slow · ease-enter', className: 'duration-slow ease-enter' },
  { name: 'duration-slow · ease-exit', className: 'duration-slow ease-exit' },
] as const;

export function MotionDemo() {
  const t = useTranslations('Design.motion');
  const [moved, setMoved] = useState(false);
  return (
    <div className="grid gap-6">
      <Button variant="outline" className="w-fit" onClick={() => setMoved((m) => !m)}>
        <Play /> {t('play')}
      </Button>
      <ul className="grid gap-4">
        {ROWS.map((row) => (
          <li key={row.name} className="grid gap-2">
            <span className="font-mono text-caption text-muted-foreground">{row.name}</span>
            <span className="relative block h-8 rounded-full bg-muted">
              <span
                className={cn(
                  'absolute top-1 left-1 size-6 rounded-full bg-primary transition-transform',
                  row.className,
                  moved && 'translate-x-[min(20rem,calc(100vw-8rem))]',
                )}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
