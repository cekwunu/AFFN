/**
 * Reads colour tokens out of src/styles/tokens.css and computes WCAG contrast.
 * Used by the contrast unit test and by the /design page, so colour values live
 * in exactly one place.
 */

export type ThemeName = 'light' | 'dark';

export interface ParsedTokens {
  /** Raw scale values, e.g. { "terracotta-600": "#a3472b" }. */
  raw: Record<string, string>;
  /** Semantic tokens per theme, resolved to hex where they point at a raw scale. */
  themes: Record<ThemeName, Record<string, string>>;
}

const DECLARATION = /--([\w-]+):\s*([^;]+);/g;

function declarations(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(DECLARATION)) {
    if (name && value) result[name] = value.trim();
  }
  return result;
}

function blockAfter(css: string, selectorPattern: RegExp): string {
  const match = selectorPattern.exec(css);
  if (!match) throw new Error(`Token block not found: ${selectorPattern}`);
  const start = match.index + match[0].length;
  return css.slice(start, css.indexOf('}', start));
}

export function parseTokens(css: string): ParsedTokens {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rootBlock = blockAfter(withoutComments, /^:root\s*\{/m);
  const raw = Object.fromEntries(
    Object.entries(declarations(rootBlock)).filter(([, value]) => value.startsWith('#')),
  );

  const resolve = (tokens: Record<string, string>): Record<string, string> =>
    Object.fromEntries(
      Object.entries(tokens).map(([name, value]) => {
        const ref = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
        return [name, (ref && raw[ref]) || value];
      }),
    );

  return {
    raw,
    themes: {
      light: resolve(declarations(blockAfter(withoutComments, /^:root,\s*\.light\s*\{/m))),
      dark: resolve(declarations(blockAfter(withoutComments, /^\.dark\s*\{/m))),
    },
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`Expected #rrggbb, got ${hex}`);
  const n = parseInt(match[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** Foreground/background pairs that must meet AA, with the minimum ratio. */
export const CONTRAST_PAIRS: ReadonlyArray<{ fg: string; bg: string; min: number }> = [
  { fg: 'foreground', bg: 'background', min: 4.5 },
  { fg: 'card-foreground', bg: 'card', min: 4.5 },
  { fg: 'popover-foreground', bg: 'popover', min: 4.5 },
  { fg: 'muted-foreground', bg: 'background', min: 4.5 },
  { fg: 'muted-foreground', bg: 'card', min: 4.5 },
  { fg: 'muted-foreground', bg: 'muted', min: 4.5 },
  { fg: 'primary-foreground', bg: 'primary', min: 4.5 },
  { fg: 'primary-foreground', bg: 'primary-hover', min: 4.5 },
  { fg: 'secondary-foreground', bg: 'secondary', min: 4.5 },
  { fg: 'secondary-foreground', bg: 'secondary-hover', min: 4.5 },
  { fg: 'accent-foreground', bg: 'accent', min: 4.5 },
  { fg: 'link', bg: 'background', min: 4.5 },
  { fg: 'link', bg: 'card', min: 4.5 },
  { fg: 'success-foreground', bg: 'success', min: 4.5 },
  { fg: 'success-subtle-foreground', bg: 'success-subtle', min: 4.5 },
  { fg: 'warning-foreground', bg: 'warning', min: 4.5 },
  { fg: 'warning-subtle-foreground', bg: 'warning-subtle', min: 4.5 },
  { fg: 'danger-foreground', bg: 'danger', min: 4.5 },
  { fg: 'danger-subtle-foreground', bg: 'danger-subtle', min: 4.5 },
  { fg: 'danger', bg: 'background', min: 4.5 },
  { fg: 'danger', bg: 'card', min: 4.5 },
  { fg: 'info-foreground', bg: 'info', min: 4.5 },
  { fg: 'info-subtle-foreground', bg: 'info-subtle', min: 4.5 },
  // Non-text: input borders, focus ring and primary buttons against the page (WCAG 1.4.11).
  { fg: 'input', bg: 'background', min: 3 },
  { fg: 'input', bg: 'card', min: 3 },
  { fg: 'ring', bg: 'background', min: 3 },
  { fg: 'ring', bg: 'card', min: 3 },
  { fg: 'primary', bg: 'background', min: 3 },
];
