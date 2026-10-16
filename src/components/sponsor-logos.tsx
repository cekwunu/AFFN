import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/link';
import { publicSponsorLogos } from '@/lib/sponsors/server';

/** Logo height per package level (1 = most prominent). */
const SIZES: Record<number, string> = {
  1: 'h-20 sm:h-24',
  2: 'h-14 sm:h-16',
  3: 'h-12',
  4: 'h-10',
  5: 'h-8',
};

/**
 * Approved sponsor logos for the public site, larger for higher packages (SPO-02). Server
 * rendered, plain images: no client JavaScript on public pages (NFR-01).
 */
export async function SponsorLogos({ eventId, heading }: { eventId: string; heading: boolean }) {
  const t = await getTranslations('Sponsors');
  const levels = await publicSponsorLogos(eventId);
  if (!levels.length) return null;
  return (
    <section aria-labelledby="sponsor-logos" className="grid gap-8" data-testid="sponsor-logos">
      {heading ? (
        <h2 id="sponsor-logos" className="font-display text-display-md font-semibold">
          {t('logosTitle')}
        </h2>
      ) : (
        <h2 id="sponsor-logos" className="sr-only">
          {t('logosTitle')}
        </h2>
      )}
      {levels.map(({ level, logos }) => (
        <ul key={level} className="flex flex-wrap items-center gap-x-12 gap-y-8" data-level={level}>
          {logos.map((logo) => (
            <li key={logo.sponsorId}>
              <Link
                href={`/sponsors/${logo.sponsorId}`}
                className="block rounded-md p-2 focus-visible:outline-offset-4"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- SVG logos, sized by height */}
                <img
                  src={logo.logoUrl}
                  alt={logo.name}
                  className={`${SIZES[level] ?? SIZES[5]} w-auto max-w-64 object-contain`}
                  loading="lazy"
                  decoding="async"
                />
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
