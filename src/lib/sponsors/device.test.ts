import { describe, expect, it } from 'vitest';
import { deviceClass } from './device';

describe('deviceClass', () => {
  it('maps user agents to a coarse device type only', () => {
    expect(
      deviceClass(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      ),
    ).toBe('mobile');
    expect(
      deviceClass('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/120 Mobile Safari/537.36'),
    ).toBe('mobile');
    expect(deviceClass('Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/120 Safari/537.36')).toBe(
      'tablet',
    );
    expect(deviceClass('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(deviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141')).toBe('desktop');
    expect(deviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605')).toBe('desktop');
    expect(deviceClass('Googlebot/2.1')).toBe('other');
    expect(deviceClass('')).toBe('other');
    expect(deviceClass(null)).toBe('other');
  });
});
