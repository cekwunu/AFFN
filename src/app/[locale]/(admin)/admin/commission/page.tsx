import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CommissionForm } from '@/components/admin/commission-form';
import { ClientIntl } from '@/components/client-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { initRequestLocale } from '@/i18n/server';
import { currentOrganization, getCurrentUser } from '@/lib/auth/server';
import { inForce, listCommissionRules, ruleTargets, toRule } from '@/lib/commission/server';
import { formatDateTimeOslo } from '@/lib/format';
import { formatOre, ore } from '@/lib/money';
import { calculateCommission, formatCommissionTerms } from '@/lib/money/commission';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { createCommissionRule } from './actions';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Commission settings (COM-01, COM-03): the rate in force at each level with a live example,
 * every rule ever made (never edited), and — for Organization Admins — a form for a new rule.
 */
export default async function CommissionPage({ params }: PageProps<'/[locale]/admin/commission'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Commission');
  const user = (await getCurrentUser())!;
  const organization = await currentOrganization();
  const event = await currentApplicationEvent();
  const isOrgAdmin = user.access.roles.some(
    (r) => r.org === organization.id && r.role === 'org_admin' && r.status === 'active',
  );
  const [rules, targets] = await Promise.all([
    listCommissionRules(organization.id),
    ruleTargets(organization.id),
  ]);
  const perOrder = t('perOrder');
  const now = new Date();
  const current = event ? inForce(rules, event.id, now) : null;
  const byId = new Map(rules.map((r) => [r.id, r]));

  const target = (r: (typeof rules)[number]) =>
    r.scope === 'organization'
      ? organization.name
      : r.scope === 'event'
        ? (r.event?.name ?? '–')
        : r.scope === 'category'
          ? `${locale === 'en' ? r.category?.name_en : r.category?.name_nb}${r.event ? ` · ${r.event.name}` : ''}`
          : (r.vendor?.display_name ?? '–');
  const example = (rule: ReturnType<typeof toRule>) => {
    try {
      const fee = calculateCommission(ore(50_000), rule);
      return t('exampleShort', {
        vendor: formatOre(fee.vendorPayout),
        fee: formatOre(fee.platformFee),
      });
    } catch {
      return t('exampleTooHigh');
    }
  };
  const cards = current
    ? [
        {
          label: t('scopes.organization'),
          rules: current.organization ? [current.organization] : [],
        },
        { label: t('scopes.event'), rules: current.event ? [current.event] : [] },
        { label: t('scopes.category'), rules: current.categories },
        { label: t('scopes.vendor'), rules: current.vendors },
      ]
    : [];

  return (
    <div className="grid gap-8">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-body text-muted-foreground">{t('intro')}</p>
      </header>

      {current && (
        <section aria-labelledby="in-force" className="grid gap-3">
          <h2 id="in-force" className="text-heading-md font-semibold">
            {t('inForce', { event: event!.name })}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.label}>
                <CardHeader>
                  <CardTitle className="text-heading-sm">{card.label}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {card.rules.length === 0 ? (
                    <p className="text-body-sm text-muted-foreground">{t('none')}</p>
                  ) : (
                    card.rules.map((rule) => (
                      <div key={rule.id} className="grid gap-0.5" data-testid="rule-in-force">
                        <p className="text-body-sm text-muted-foreground">
                          {target(byId.get(rule.id)!)}
                        </p>
                        <p className="text-body font-semibold">
                          {formatCommissionTerms(rule, perOrder)}
                        </p>
                        <p className="text-caption text-muted-foreground">{example(rule)}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-body-sm text-muted-foreground">{t('precedence')}</p>
        </section>
      )}

      <section aria-labelledby="new-rule" className="grid gap-3">
        <h2 id="new-rule" className="text-heading-md font-semibold">
          {t('newRule')}
        </h2>
        {isOrgAdmin ? (
          <Card>
            <CardContent className="pt-6">
              <ClientIntl namespaces={['Components', 'Commission']}>
                <CommissionForm
                  action={createCommissionRule}
                  events={targets.events.map((e) => ({ id: e.id, name: e.name }))}
                  categories={targets.categories.map((c) => ({
                    id: c.id,
                    name: locale === 'en' ? c.name_en : c.name_nb,
                  }))}
                  vendors={targets.vendors.map((v) => ({ id: v.id, name: v.display_name }))}
                  defaultEventId={event?.id ?? null}
                />
              </ClientIntl>
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-xl border border-border bg-card p-6 text-body text-muted-foreground">
            {t('onlyOrgAdmin')}
          </p>
        )}
      </section>

      <section aria-labelledby="history" className="grid gap-3">
        <h2 id="history" className="text-heading-md font-semibold">
          {t('history')}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableCaption className="sr-only">{t('history')}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.level')}</TableHead>
                <TableHead>{t('columns.applies')}</TableHead>
                <TableHead>{t('columns.terms')}</TableHead>
                <TableHead>{t('columns.from')}</TableHead>
                <TableHead>{t('columns.reason')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id} data-testid="rule-row">
                  <TableCell>
                    <Badge variant="outline">{t(`scopes.${r.scope}`)}</Badge>
                  </TableCell>
                  <TableCell>{target(r)}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    {formatCommissionTerms(toRule(r), perOrder)}
                    {new Date(r.effective_from) > now && (
                      <Badge variant="info" className="ml-2">
                        {t('upcoming')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTimeOslo(r.effective_from, locale)}
                  </TableCell>
                  <TableCell>{r.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
