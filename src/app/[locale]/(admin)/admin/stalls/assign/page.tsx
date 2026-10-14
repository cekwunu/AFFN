import { clsx } from 'clsx';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AssignForm } from '@/components/admin/stall-forms';
import { StallsNav, stallMessages } from '@/components/admin/stalls-nav';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { listApprovedVendors, listStalls } from '@/lib/stalls/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { assignStall } from '../actions';

export const metadata: Metadata = { robots: { index: false } };

const FILTERS = ['power', 'water', 'unassigned'] as const;
type Filter = (typeof FILTERS)[number];

/** Stall assignment (STL-02): approved vendors and free stalls, with conflicts flagged. */
export default async function AssignPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/stalls/assign'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Stalls.assign');
  const tInv = await getTranslations('Stalls.inventory');
  const event = await currentApplicationEvent();
  if (!event) return <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>;
  const [stalls, allVendors, messages] = await Promise.all([
    listStalls(event.id),
    listApprovedVendors(event.id),
    stallMessages(),
  ]);
  const raw = (await searchParams).needs;
  const filter = FILTERS.find((f) => f === raw) ?? null;
  const vendors = allVendors.filter(
    (v) =>
      filter === null ||
      (filter === 'power' && v.needsPower) ||
      (filter === 'water' && v.needsWater) ||
      (filter === 'unassigned' && !v.stallId),
  );
  const free = stalls.filter((s) => !s.assignedTo);
  const byId = new Map(stalls.map((s) => [s.id, s]));
  const option = (s: (typeof stalls)[number]) => ({
    id: s.id,
    number: s.number,
    zone: s.zone,
    hasPower: s.has_power,
    hasWater: s.has_water,
  });
  const filterLabel: Record<Filter | 'all', string> = {
    all: t('all'),
    power: t('needsPower'),
    water: t('needsWater'),
    unassigned: t('unassigned'),
  };

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-body-sm font-semibold text-primary">{event.name}</p>
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
      </header>
      <StallsNav active="assign" />

      <nav aria-label={t('filter')}>
        <ul className="flex flex-wrap gap-2">
          {([null, ...FILTERS] as const).map((f) => (
            <li key={f ?? 'all'}>
              <Link
                href={f ? `/admin/stalls/assign?needs=${f}` : '/admin/stalls/assign'}
                aria-current={filter === f ? 'page' : undefined}
                className={clsx(
                  'inline-flex min-h-10 items-center rounded-full border px-3.5 text-body-sm font-medium transition-colors',
                  filter === f
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:bg-accent',
                )}
              >
                {filterLabel[f ?? 'all']}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="vendors" className="grid content-start gap-3">
          <h2 id="vendors" className="text-heading-sm font-semibold">
            {t('vendors')}{' '}
            <span className="text-muted-foreground tabular-nums">({vendors.length})</span>
          </h2>
          {vendors.length === 0 ? (
            <p className="text-body text-muted-foreground">{t('emptyVendors')}</p>
          ) : (
            <ul className="grid gap-3">
              {vendors.map((v) => {
                const current = v.stallId ? byId.get(v.stallId) : undefined;
                const options = [...(current ? [current] : []), ...free].map(option);
                const type = v.stallType
                  ? locale === 'en'
                    ? v.stallType.name_en
                    : v.stallType.name_nb
                  : null;
                return (
                  <li
                    key={v.id}
                    data-testid="assign-vendor"
                    className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"
                  >
                    <div className="grid content-start gap-1.5">
                      <p className="font-semibold">{v.name}</p>
                      <p className="text-body-sm text-muted-foreground">
                        {current ? t('current', { number: current.number }) : t('none')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {v.needsPower && <Badge variant="info">{t('needsPower')}</Badge>}
                        {v.needsWater && <Badge variant="info">{t('needsWater')}</Badge>}
                        <Badge variant={v.feePaid ? 'success' : 'warning'}>
                          {t('fee', { status: v.feePaid ? t('feePaid') : t('feeUnpaid') })}
                        </Badge>
                      </div>
                      {type && (
                        <p className="text-caption text-muted-foreground">
                          {t('requested', { type })}
                        </p>
                      )}
                      {v.preferredZone && (
                        <p className="text-caption text-muted-foreground">
                          {t('zone', { zone: v.preferredZone })}
                        </p>
                      )}
                    </div>
                    <AssignForm
                      action={assignStall}
                      eventVendorId={v.id}
                      currentStallId={v.stallId}
                      needsPower={v.needsPower}
                      needsWater={v.needsWater}
                      stalls={options}
                      messages={messages}
                      labels={{
                        label: t('stallFor', { vendor: v.name }),
                        choose: t('choose'),
                        assign: t('assign'),
                        reassign: t('reassign'),
                        release: t('release'),
                        working: t('working'),
                        conflictPower: t('conflictPower'),
                        conflictWater: t('conflictWater'),
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="free" className="grid content-start gap-3">
          <h2 id="free" className="text-heading-sm font-semibold">
            {t('stalls')}{' '}
            <span className="text-muted-foreground tabular-nums">({free.length})</span>
          </h2>
          {free.length === 0 ? (
            <p className="text-body text-muted-foreground">{t('emptyStalls')}</p>
          ) : (
            <ul className="grid gap-2 rounded-xl border border-border bg-card p-3">
              {free.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-body-sm"
                >
                  <span>
                    <span className="font-semibold">{s.number}</span>
                    {s.zone && <span className="text-muted-foreground"> · {s.zone}</span>}
                  </span>
                  <span className="flex gap-1">
                    {s.has_power && <Badge variant="neutral">{tInv('power')}</Badge>}
                    {s.has_water && <Badge variant="neutral">{tInv('water')}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
