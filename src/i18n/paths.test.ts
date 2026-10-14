import { describe, expect, it } from 'vitest';
import { localizePath, splitLocale } from './paths';

describe('splitLocale', () => {
  it.each([
    ['/', 'nb', '/'],
    ['/vendor', 'nb', '/vendor'],
    ['/en', 'en', '/'],
    ['/en/vendor/orders', 'en', '/vendor/orders'],
    ['/nb/vendor', 'nb', '/vendor'],
    ['/english', 'nb', '/english'],
  ])('%s → %s %s', (pathname, locale, path) => {
    expect(splitLocale(pathname)).toEqual({ locale, path });
  });
});

describe('localizePath', () => {
  it('leaves bokmål unprefixed and prefixes English', () => {
    expect(localizePath('/', 'nb')).toBe('/');
    expect(localizePath('/vendor', 'nb')).toBe('/vendor');
    expect(localizePath('/', 'en')).toBe('/en');
    expect(localizePath('/vendor#top', 'en')).toBe('/en/vendor#top');
  });

  it('leaves anchors and external links alone', () => {
    expect(localizePath('#main', 'en')).toBe('#main');
    expect(localizePath('https://affn.no', 'en')).toBe('https://affn.no');
    expect(localizePath('//cdn.example', 'en')).toBe('//cdn.example');
  });

  it('round-trips with splitLocale', () => {
    for (const locale of ['nb', 'en'] as const) {
      expect(splitLocale(localizePath('/sponsor', locale))).toEqual({ locale, path: '/sponsor' });
    }
  });
});
