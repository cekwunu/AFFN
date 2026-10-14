import { ClipboardList, LayoutDashboard, Package, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { use } from 'react';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Motif, MotifMark } from '@/components/motif';
import { PortalShell } from '@/components/shells/portal-shell';
import { PublicShell } from '@/components/shells/public-shell';
import { StorefrontShell } from '@/components/shells/storefront-shell';
import { Brand } from '@/components/shells/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Toaster } from '@/components/ui/toast';
import { ClientIntl } from '@/components/client-intl';
import { CLIENT_NAMESPACES } from '@/i18n/client-messages';
import { initRequestLocale } from '@/i18n/server';
import { formatOre, ore } from '@/lib/money';
import { ComponentDemos } from './_sections/component-demos';
import { MotionDemo } from './_sections/motion-demo';
import { Section } from './_sections/section';
import {
  ColourSection,
  SpacingRadiusShadowSections,
  TypographySection,
} from './_sections/tokens-section';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/design'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: initRequestLocale(locale), namespace: 'Design' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

const SECTIONS = [
  'colour',
  'typography',
  'spacing',
  'radius',
  'shadow',
  'motion',
  'motif',
  'components',
  'shells',
  'photography',
] as const;

export default function DesignPage({ params }: PageProps<'/[locale]/design'>) {
  initRequestLocale(use(params).locale);
  const t = useTranslations('Design');
  return (
    // The design page's client demos also need the Design namespace.
    <ClientIntl namespaces={[...CLIENT_NAMESPACES, 'Design']}>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Brand />
          <div className="ml-auto flex items-center gap-2" role="group" aria-label={t('controls')}>
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 py-16 sm:py-24">
          <p className="text-caption font-semibold tracking-widest text-primary uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="max-w-3xl font-display text-display-xl font-semibold sm:text-display-2xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-body-lg text-muted-foreground">{t('intro')}</p>
          <Motif className="mt-4 max-w-md" />
          <nav aria-label={t('contents')} className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {SECTIONS.map((id) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="inline-flex h-9 items-center rounded-full border border-border px-4 text-body-sm font-medium text-muted-foreground transition-colors hover:border-input hover:text-foreground"
                  >
                    {t(`sections.${id}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <ColourSection />
        <TypographySection />
        <SpacingRadiusShadowSections />

        <Section id="motion" title={t('sections.motion')} intro={t('motion.intro')}>
          <MotionDemo />
        </Section>

        <Section id="motif" title={t('sections.motif')} intro={t('motif.intro')}>
          <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
            <div className="grid gap-4 rounded-xl border border-border bg-card p-6">
              <p className="text-caption font-semibold text-muted-foreground uppercase">
                {t('motif.band')}
              </p>
              <Motif />
              <Motif className="text-secondary-foreground" />
              <Motif className="text-muted-foreground" />
            </div>
            <div className="grid gap-4 rounded-xl border border-border bg-card p-6">
              <p className="text-caption font-semibold text-muted-foreground uppercase">
                {t('motif.mark')}
              </p>
              <div className="flex items-center gap-6">
                <MotifMark className="size-12" />
                <MotifMark className="size-8" />
                <MotifMark className="size-6 text-foreground" />
              </div>
            </div>
          </div>
        </Section>

        <Section id="components" title={t('sections.components')}>
          <ComponentDemos />
        </Section>

        <Section id="shells" title={t('sections.shells')} intro={t('shells.intro')}>
          <ShellPreviews />
        </Section>

        <Section id="photography" title={t('sections.photography')} intro={t('photography.intro')}>
          <div className="grid gap-6 md:grid-cols-2">
            {(['do', 'dont'] as const).map((kind) => (
              <Card key={kind}>
                <CardContent className="grid gap-4">
                  <h3 className="text-heading-sm font-semibold">{t(`photography.${kind}`)}</h3>
                  <ul className="grid list-disc gap-2 pl-5 text-body-sm marker:text-primary">
                    {(t.raw(`photography.${kind}Items`) as string[]).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      </main>
      <Toaster />
    </ClientIntl>
  );
}

function PreviewFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className="grid gap-3">
      <figcaption className="text-heading-sm font-semibold">{title}</figcaption>
      <div
        className={`h-[32rem] overflow-auto rounded-xl border border-border shadow-md ${className ?? ''}`}
        // Scrollable region must be reachable by keyboard (WCAG 2.1.1).
        tabIndex={0}
        role="region"
        aria-label={title}
      >
        {children}
      </div>
    </figure>
  );
}

function ShellPreviews() {
  const t = useTranslations('Design.shells');
  return (
    <div className="grid gap-12">
      <PreviewFrame title={t('public')}>
        <PublicShell embedded className="min-h-full">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <p className="font-display text-display-lg font-semibold">{t('sampleHeading')}</p>
            <p className="mt-3 text-body-lg text-muted-foreground">{t('sampleBody')}</p>
          </div>
        </PublicShell>
      </PreviewFrame>

      <PreviewFrame title={t('portal')}>
        <PortalShell
          area="vendor"
          embedded
          className="min-h-full"
          nav={[
            { href: '/vendor', label: t('navOrders'), icon: <ClipboardList /> },
            { href: '/design#shells', label: t('navProducts'), icon: <Package /> },
            { href: '/design#portal', label: t('navSettlement'), icon: <Wallet /> },
            { href: '/design#overview', label: t('sampleHeading'), icon: <LayoutDashboard /> },
          ]}
        >
          <div className="grid gap-6">
            <p className="font-display text-display-md font-semibold">{t('navOrders')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label={t('navOrders')} value="128" />
              <StatCard label={t('navSettlement')} value={formatOre(ore(1_250_000))} />
            </div>
          </div>
        </PortalShell>
      </PreviewFrame>

      <PreviewFrame title={t('storefront')} className="mx-auto w-full max-w-sm">
        <StorefrontShell
          embedded
          className="min-h-full"
          vendorName={t('vendorName')}
          details={t('vendorDetails')}
          cart={{ count: 2, totalLabel: formatOre(ore(34_000)), href: '/design#shells' }}
        >
          <ul className="grid gap-3">
            {[18_500, 15_500].map((price, index) => (
              <li
                key={index}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t('menuItem')}</p>
                  <p className="text-body-sm text-muted-foreground">{t('menuItemDesc')}</p>
                  <p className="mt-2 font-medium tabular-nums">{formatOre(ore(price))}</p>
                </div>
                <Button size="sm" variant="secondary">
                  {t('add')}
                </Button>
              </li>
            ))}
          </ul>
        </StorefrontShell>
      </PreviewFrame>
    </div>
  );
}
