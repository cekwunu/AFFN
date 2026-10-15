import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import { initRequestLocale } from '@/i18n/server';
import { currentOrganization } from '@/lib/auth/server';
import { EXPORT_KINDS } from '@/lib/exports/server';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

export const metadata: Metadata = { robots: { index: false } };

/** CSV exports for the accountant (TRX-03): what, which event and which days. */
export default async function ExportsPage({ params }: PageProps<'/[locale]/admin/exports'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Exports');
  const organization = await currentOrganization();
  const current = await currentApplicationEvent();
  const supabase = await createClient();
  const { data: events } = await supabase
    .from('events')
    .select('id, name, starts_at')
    .eq('organization_id', organization.id)
    .order('starts_at', { ascending: false });
  const today = new Date().toISOString().slice(0, 10);
  const control = `${fieldControlClasses} h-11 px-3`;

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('intro')}</p>
      </header>
      <form
        method="get"
        action="/api/admin/exports"
        className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
      >
        <input type="hidden" name="locale" value={locale} />
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('form.kind')}
          <select name="kind" className={control} defaultValue="transactions">
            {EXPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('form.event')}
          <select name="event" className={control} defaultValue={current?.id}>
            {(events ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('form.from')}
          <input
            type="date"
            name="from"
            required
            defaultValue={`${today.slice(0, 4)}-01-01`}
            className={control}
          />
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('form.to')}
          <input type="date" name="to" required defaultValue={today} className={control} />
        </label>
        <div className="grid gap-2 sm:col-span-2">
          <button type="submit" className={`${buttonVariants({ size: 'lg' })} w-fit`}>
            {t('form.download')}
          </button>
          <p className="text-caption text-muted-foreground">{t('form.hint')}</p>
        </div>
      </form>
    </div>
  );
}
