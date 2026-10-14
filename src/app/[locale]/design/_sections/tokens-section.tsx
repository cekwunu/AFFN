import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { CONTRAST_PAIRS, contrastRatio, parseTokens, type ThemeName } from '@/lib/design/tokens';
import { cn } from '@/lib/utils';
import { Section } from './section';

const SCALES = ['sand', 'terracotta', 'ochre', 'forest', 'amber', 'brick', 'fjord'] as const;

function loadTokens() {
  return parseTokens(readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8'));
}

export function ColourSection() {
  const t = useTranslations('Design');
  const tokens = loadTokens();
  const hexTokens = (theme: ThemeName) =>
    Object.entries(tokens.themes[theme]).filter(([, value]) => value.startsWith('#'));

  return (
    <Section id="colour" title={t('sections.colour')}>
      <h3 className="mb-2 text-heading-md font-semibold">{t('colour.scales')}</h3>
      <p className="mb-6 max-w-2xl text-body-sm text-muted-foreground">{t('colour.scalesIntro')}</p>
      <div className="mb-14 grid gap-6">
        {SCALES.map((scale) => {
          const steps = Object.entries(tokens.raw).filter(([name]) => name.startsWith(`${scale}-`));
          return (
            <div key={scale} className="grid gap-2">
              <p className="text-body-sm font-semibold">{t(`colour.scale.${scale}`)}</p>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-14">
                {steps.map(([name, value]) => (
                  <li key={name} className="grid gap-1">
                    <span
                      className="block h-12 rounded-md border border-border"
                      style={{ backgroundColor: `var(--${name})` }}
                    />
                    <span className="text-caption font-medium">
                      {name.replace(`${scale}-`, '')}
                    </span>
                    <span className="font-mono text-caption text-muted-foreground">{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <h3 className="mb-2 text-heading-md font-semibold">{t('colour.semantic')}</h3>
      <p className="mb-6 max-w-2xl text-body-sm text-muted-foreground">
        {t('colour.semanticIntro')}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {(['light', 'dark'] as const).map((theme) => (
          <div
            key={theme}
            className={cn(
              theme,
              'grid gap-6 rounded-xl border border-border bg-background p-6 text-foreground',
            )}
          >
            <p className="text-heading-sm font-semibold">{t(`colour.${theme}`)}</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {hexTokens(theme).map(([name, value]) => (
                <li key={name} className="flex items-center gap-2">
                  <span
                    className="size-8 shrink-0 rounded-md border border-border"
                    style={{ backgroundColor: `var(--${name})` }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-caption font-medium">{name}</span>
                    <span className="font-mono text-caption text-muted-foreground">{value}</span>
                  </span>
                </li>
              ))}
            </ul>
            <ul className="grid gap-2">
              {CONTRAST_PAIRS.map(({ fg, bg, min }) => {
                const ratio = contrastRatio(tokens.themes[theme][fg]!, tokens.themes[theme][bg]!);
                return (
                  <li
                    key={`${fg}-${bg}`}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <span
                      className="inline-flex h-8 w-12 shrink-0 items-center justify-center rounded-sm text-body-sm font-semibold"
                      style={
                        min >= 4.5
                          ? { backgroundColor: `var(--${bg})`, color: `var(--${fg})` }
                          : {
                              backgroundColor: `var(--${bg})`,
                              boxShadow: `inset 0 0 0 3px var(--${fg})`,
                            }
                      }
                    >
                      {min >= 4.5 ? 'Aa' : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-caption">
                      {fg} / {bg}
                    </span>
                    <span className="text-caption text-muted-foreground tabular-nums">
                      {t('colour.ratio', { ratio: ratio.toFixed(1) })}
                    </span>
                    <Badge variant="success">{t('colour.pass')}</Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

const TYPE_SCALE = [
  { name: 'display-2xl', className: 'font-display text-display-2xl font-semibold', meta: '60/63' },
  { name: 'display-xl', className: 'font-display text-display-xl font-semibold', meta: '48/53' },
  { name: 'display-lg', className: 'font-display text-display-lg font-semibold', meta: '36/41' },
  { name: 'display-md', className: 'font-display text-display-md font-semibold', meta: '30/36' },
  { name: 'heading-lg', className: 'text-heading-lg font-semibold', meta: '24/31' },
  { name: 'heading-md', className: 'text-heading-md font-semibold', meta: '20/28' },
  { name: 'heading-sm', className: 'text-heading-sm font-semibold', meta: '17/25' },
  { name: 'body-lg', className: 'text-body-lg', meta: '18/29' },
  { name: 'body', className: 'text-body', meta: '16/26' },
  { name: 'body-sm', className: 'text-body-sm', meta: '14/21' },
  { name: 'caption', className: 'text-caption', meta: '12/17' },
] as const;

export function TypographySection() {
  const t = useTranslations('Design');
  return (
    <Section id="typography" title={t('sections.typography')} intro={t('typography.intro')}>
      <div className="mb-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="mb-3 text-caption font-semibold tracking-wide text-muted-foreground uppercase">
            {t('typography.display')}
          </p>
          <p className="font-display text-display-lg font-semibold">Ææ Øø Åå</p>
          <p className="mt-3 font-display text-body-lg">{t('typography.alphabet')}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="mb-3 text-caption font-semibold tracking-wide text-muted-foreground uppercase">
            {t('typography.text')}
          </p>
          <p className="text-display-lg font-semibold">Ææ Øø Åå</p>
          <p className="mt-3 text-body-lg">{t('typography.alphabet')}</p>
        </div>
      </div>
      <ul className="grid gap-6">
        {TYPE_SCALE.map((step) => (
          <li
            key={step.name}
            className="grid gap-1 md:grid-cols-[10rem_1fr] md:items-baseline md:gap-6"
          >
            <span className="font-mono text-caption text-muted-foreground">
              {step.name} · {step.meta}
            </span>
            <span className={cn(step.className, 'truncate')}>{t('typography.sample')}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const SPACING = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24] as const;
const RADII = [
  'rounded-sm',
  'rounded-md',
  'rounded-lg',
  'rounded-xl',
  'rounded-2xl',
  'rounded-full',
] as const;
const SHADOWS = ['shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg'] as const;

export function SpacingRadiusShadowSections() {
  const t = useTranslations('Design');
  return (
    <>
      <Section id="spacing" title={t('sections.spacing')} intro={t('spacing.intro')}>
        <ul className="grid gap-3">
          {SPACING.map((step) => (
            <li key={step} className="flex items-center gap-4">
              <span className="w-24 shrink-0 font-mono text-caption text-muted-foreground">
                {step} · {step * 4}px
              </span>
              <span
                className="h-4 rounded-sm bg-primary"
                style={{ width: `calc(var(--spacing) * ${step})` }}
              />
            </li>
          ))}
        </ul>
      </Section>
      <Section id="radius" title={t('sections.radius')}>
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          {RADII.map((radius) => (
            <li key={radius} className="grid gap-2">
              <span className={cn('block h-20 border border-input bg-muted', radius)} />
              <span className="font-mono text-caption text-muted-foreground">{radius}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="shadow" title={t('sections.shadow')} intro={t('shadow.intro')}>
        <ul className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {SHADOWS.map((shadow) => (
            <li key={shadow} className="grid gap-3">
              <span className={cn('block h-24 rounded-xl border border-border bg-card', shadow)} />
              <span className="font-mono text-caption text-muted-foreground">{shadow}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
