import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, contrastRatio, parseTokens, type ThemeName } from '@/lib/design/tokens';

const tokens = parseTokens(readFileSync(new URL('./tokens.css', import.meta.url), 'utf8'));

describe('design tokens', () => {
  it('parses raw scales and both themes', () => {
    expect(tokens.raw['terracotta-600']).toBe('#a3472b');
    expect(tokens.themes.light.primary).toMatch(/^#/);
    expect(tokens.themes.dark.primary).toMatch(/^#/);
  });

  it('defines the same semantic tokens in light and dark', () => {
    expect(Object.keys(tokens.themes.dark).sort()).toEqual(Object.keys(tokens.themes.light).sort());
  });

  for (const theme of ['light', 'dark'] as ThemeName[]) {
    describe(`${theme} theme meets WCAG 2.1 AA`, () => {
      it.each(CONTRAST_PAIRS)('$fg on $bg ≥ $min:1', ({ fg, bg, min }) => {
        const values = tokens.themes[theme];
        const ratio = contrastRatio(values[fg]!, values[bg]!);
        expect(
          ratio,
          `${fg} ${values[fg]} on ${bg} ${values[bg]} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(min);
      });
    });
  }
});

describe('contrastRatio', () => {
  it('matches known values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});
