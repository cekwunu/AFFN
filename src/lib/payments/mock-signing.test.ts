import { describe, expect, it } from 'vitest';
import { decodeLinkToken, encodeLinkToken, sign, verify } from './mock-signing';

const payload = {
  kind: 'stall_fee' as const,
  reference: '7f0c0d5e-0000-4000-8000-000000000001',
  amountOre: 312500,
  description: 'Standavgift',
  returnUrl: 'http://localhost:3000/vendor/stall',
  exp: Date.parse('2027-01-01T00:00:00Z'),
};

describe('mock payment signing', () => {
  it('round-trips a link token and rejects tampering and expiry', () => {
    const token = encodeLinkToken(payload, 'secret');
    expect(decodeLinkToken(token, 'secret', Date.parse('2026-12-01'))).toEqual(payload);
    expect(decodeLinkToken(token, 'other-secret', Date.parse('2026-12-01'))).toBeNull();
    expect(decodeLinkToken(token, 'secret', Date.parse('2027-01-02'))).toBeNull();

    const [body, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, amountOre: 1 })).toString('base64url');
    expect(decodeLinkToken(`${forged}.${signature}`, 'secret', 0)).toBeNull();
    expect(decodeLinkToken(`${body}`, 'secret', 0)).toBeNull();
  });

  it('verifies webhook signatures', () => {
    const raw = JSON.stringify({ id: 'evt_1' });
    expect(verify(raw, sign(raw, 'secret'), 'secret')).toBe(true);
    expect(verify(raw, sign(raw, 'secret'), 'wrong')).toBe(false);
    expect(verify(`${raw} `, sign(raw, 'secret'), 'secret')).toBe(false);
    expect(verify(raw, null, 'secret')).toBe(false);
  });
});
