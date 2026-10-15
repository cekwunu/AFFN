import { describe, expect, it } from 'vitest';
import { clientIp, rateLimitKey } from './rate-limit-keys';

describe('rateLimitKey', () => {
  it('hashes the value so no IP or email is stored', () => {
    const key = rateLimitKey('signInAccount', 'Kari@Example.no', 'secret');
    expect(key).toMatch(/^signInAccount:[0-9a-f]{64}$/);
    expect(key).not.toContain('example');
  });

  it('is stable for the same value regardless of case and spacing, and differs per secret', () => {
    expect(rateLimitKey('b', ' kari@example.no ', 's')).toBe(
      rateLimitKey('b', 'KARI@example.no', 's'),
    );
    expect(rateLimitKey('b', 'x', 's1')).not.toBe(rateLimitKey('b', 'x', 's2'));
  });
});

describe('clientIp', () => {
  const headers = (values: Record<string, string>) => new Headers(values);
  it('takes the first x-forwarded-for address', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });
  it('falls back to x-real-ip, then "unknown"', () => {
    expect(clientIp(headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(headers({}))).toBe('unknown');
  });
});
