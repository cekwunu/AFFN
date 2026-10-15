import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LayoutEditor } from '@/components/admin/stall-forms';
import { StallsNav } from '@/components/admin/stalls-nav';
import { initRequestLocale } from '@/i18n/server';
import { eventMediaUrl, listStalls, venueMapPath } from '@/lib/stalls/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { setPin, setVenueMap } from '../actions';

export const metadata: Metadata = { robots: { index: false } };

/** Venue image and stall pins (STL-03). */
export default async function StallLayoutPage({
  params,
}: PageProps<'/[locale]/admin/stalls/layout'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Stalls.layout');
  const tErr = await getTranslations('Stalls.errors');
  const event = await currentApplicationEvent();
  if (!event) return <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>;
  const [stalls, path] = await Promise.all([listStalls(event.id), venueMapPath(event.id)]);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-body-sm font-semibold text-primary">{event.name}</p>
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
      </header>
      <StallsNav active="layout" />
      <LayoutEditor
        eventId={event.id}
        mapUrl={eventMediaUrl(path)}
        stalls={stalls.map((s) => ({ id: s.id, number: s.number, x: s.map_x, y: s.map_y }))}
        setVenueMap={setVenueMap}
        setPin={setPin}
        labels={{
          upload: t('upload'),
          replace: t('replace'),
          uploadHint: t('uploadHint'),
          uploading: t('uploading'),
          uploaded: t('uploaded'),
          uploadError: tErr('upload'),
          noMap: t('noMap'),
          mapAlt: t('mapAlt'),
          select: t('select'),
          placed: t('placed'),
          notPlaced: t('notPlaced'),
          placeHint: t('placeHint'),
          x: t('x'),
          y: t('y'),
          savePin: t('savePin'),
          saved: t('saved'),
          unknown: tErr('unknown'),
        }}
      />
    </div>
  );
}
