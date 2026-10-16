import { FileText } from 'lucide-react';
import type { DocumentKind } from '@/lib/documents/server';

/**
 * Links to stored documents (SET-04): each opens the current version (made on first request),
 * with an English version next to it. Plain links: the files come from /api/documents/for.
 */
export function DocumentLinks({
  links,
  english,
}: {
  links: { kind: DocumentKind; id: string; label: string }[];
  english: string;
}) {
  if (!links.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm" data-testid="document-links">
      {links.map((l) => {
        const href = `/api/documents/for?kind=${l.kind}&id=${l.id}`;
        return (
          <li key={`${l.kind}-${l.id}`} className="flex items-baseline gap-2">
            <FileText aria-hidden className="size-4 self-center text-muted-foreground" />
            <a href={href} className="font-medium text-link underline-offset-4 hover:underline">
              {l.label}
            </a>
            <a
              href={`${href}&lang=en`}
              lang="en"
              className="text-caption text-link underline-offset-4 hover:underline"
            >
              {english}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
