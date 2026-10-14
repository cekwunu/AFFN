import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CsvImport, StallForm, type StallValues } from '@/components/admin/stall-forms';
import { StallsNav, stallMessages } from '@/components/admin/stalls-nav';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { listStalls } from '@/lib/stalls/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { importStalls, saveStall } from './actions';

export const metadata: Metadata = { robots: { index: false } };

/** Øre as a kroner string for the edit form ("2500" or "2500,50"). */
const kroner = (amount: number) =>
  amount % 100 === 0
    ? String(amount / 100)
    : `${Math.floor(amount / 100)},${String(amount % 100).padStart(2, '0')}`;

/** Stall inventory (STL-01): table, create/edit and CSV import. */
export default async function StallsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/stalls'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Stalls.inventory');
  const event = await currentApplicationEvent();
  if (!event) return <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>;
  const stalls = await listStalls(event.id);
  const messages = await stallMessages();
  const editId = (await searchParams).edit;
  const editing = typeof editId === 'string' ? stalls.find((s) => s.id === editId) : undefined;
  const initial: StallValues | undefined = editing && {
    id: editing.id,
    number: editing.number,
    zone: editing.zone ?? '',
    sizeLabel: editing.size_label ?? '',
    widthCm: editing.width_cm ? String(editing.width_cm) : '',
    depthCm: editing.depth_cm ? String(editing.depth_cm) : '',
    fee: kroner(editing.fee_ore),
    hasPower: editing.has_power,
    hasWater: editing.has_water,
    isPremium: editing.is_premium,
  };
  const formLabels = {
    number: t('number'),
    zone: t('zone'),
    size: t('size'),
    width: t('width'),
    depth: t('depth'),
    fee: t('fee'),
    power: t('power'),
    water: t('water'),
    premium: t('premium'),
    save: t('save'),
    saving: t('saving'),
  };
  const yes = (value: boolean, label: string) =>
    value ? (
      <>
        <Check aria-hidden className="size-4 text-success-subtle-foreground" />
        <span className="sr-only">{label}</span>
      </>
    ) : null;
  const head = 'px-3 py-2 text-left font-medium text-muted-foreground';
  const cell = 'px-3 py-2.5';

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-body-sm font-semibold text-primary">{event.name}</p>
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
      </header>
      <StallsNav active="inventory" />

      {stalls.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-body-sm">
            <caption className="sr-only">{t('caption', { event: event.name })}</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className={head}>
                  {t('number')}
                </th>
                <th scope="col" className={head}>
                  {t('zone')}
                </th>
                <th scope="col" className={head}>
                  {t('size')}
                </th>
                <th scope="col" className={head}>
                  {t('power')}
                </th>
                <th scope="col" className={head}>
                  {t('water')}
                </th>
                <th scope="col" className={head}>
                  {t('premium')}
                </th>
                <th scope="col" className={`${head} text-right`}>
                  {t('fee')}
                </th>
                <th scope="col" className={head}>
                  {t('assigned')}
                </th>
                <th scope="col" className={head}>
                  <span className="sr-only">{t('edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stalls.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <th scope="row" className={`${cell} text-left font-semibold`}>
                    {s.number}
                  </th>
                  <td className={cell}>{s.zone}</td>
                  <td className={cell}>
                    {s.size_label}
                    {s.width_cm && s.depth_cm ? (
                      <span className="text-muted-foreground">
                        {' '}
                        ({s.width_cm} × {s.depth_cm} cm)
                      </span>
                    ) : null}
                  </td>
                  <td className={cell}>{yes(s.has_power, t('power'))}</td>
                  <td className={cell}>{yes(s.has_water, t('water'))}</td>
                  <td className={cell}>{yes(s.is_premium, t('premium'))}</td>
                  <td className={`${cell} text-right tabular-nums`}>{formatNok(ore(s.fee_ore))}</td>
                  <td className={cell}>
                    <Badge variant={s.assignedTo ? 'secondary' : 'outline'}>
                      {s.assignedTo ? t('assigned') : t('free')}
                    </Badge>
                  </td>
                  <td className={`${cell} text-right`}>
                    <Link
                      href={`/admin/stalls?edit=${s.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {t('edit')}
                      <span className="sr-only"> {s.number}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section
        aria-labelledby="stall-form"
        className="grid gap-4 rounded-xl border border-border bg-card p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="stall-form" className="text-heading-sm font-semibold">
            {initial ? t('editTitle', { number: initial.number }) : t('newTitle')}
          </h2>
          {initial && (
            <Link
              href="/admin/stalls"
              className="text-body-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('cancel')}
            </Link>
          )}
        </div>
        <StallForm
          key={initial?.id ?? 'new'}
          action={saveStall}
          initial={initial}
          labels={formLabels}
          messages={messages}
        />
      </section>

      <section
        aria-labelledby="stall-import"
        className="grid gap-4 rounded-xl border border-border bg-card p-5"
      >
        <h2 id="stall-import" className="text-heading-sm font-semibold">
          {t('importTitle')}
        </h2>
        <CsvImport
          action={importStalls}
          messages={messages}
          labels={{
            hint: t('importHint'),
            csv: t('csv'),
            file: t('csvFile'),
            rowError: t('rowError', { line: '{line}', message: '{message}' }),
            previewTitle: t('previewTitle', { count: '{count}' }),
            import: t('import', { count: '{count}' }),
            importing: t('importing'),
          }}
        />
      </section>
    </div>
  );
}
