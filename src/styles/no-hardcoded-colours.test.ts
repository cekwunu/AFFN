import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Colour values may only appear in the token file. */
const ROOT = join(process.cwd(), 'src');
const ALLOWED = new Set(['styles/tokens.css']);

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\(/;
// Tailwind's default palette names (switched off in globals.css, but catch them early).
const PALETTE_CLASS =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|shadow|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;
const NAMED_COLOUR =
  /\b(?:color|background(?:-color)?|fill|stroke)\s*:\s*['"]?(?:white|black|red|blue|green)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('no hard-coded colours outside the token file', () => {
  it('finds no colour literals or default-palette classes in src/', () => {
    const offences: string[] = [];
    for (const path of files(ROOT)) {
      const rel = relative(ROOT, path);
      if (ALLOWED.has(rel)) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          // Skip comments such as "// see #123".
          const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
          if (COLOUR_LITERAL.test(code) || PALETTE_CLASS.test(code) || NAMED_COLOUR.test(code)) {
            offences.push(`${rel}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offences).toEqual([]);
  });

  it('the patterns catch what they should', () => {
    expect(COLOUR_LITERAL.test("color: '#fff'")).toBe(true);
    expect(COLOUR_LITERAL.test('rgb(0 0 0)')).toBe(true);
    expect(PALETTE_CLASS.test('className="bg-red-500"')).toBe(true);
    expect(PALETTE_CLASS.test('className="text-white"')).toBe(true);
    expect(PALETTE_CLASS.test('className="bg-primary text-muted-foreground"')).toBe(false);
    expect(COLOUR_LITERAL.test('href={`#${id}`}')).toBe(false);
  });
});
