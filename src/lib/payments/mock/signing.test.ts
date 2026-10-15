import { describe, expect, it } from 'vitest';
import { decodeToken, encodeToken, sign, stableId, verify } from './signing';

const payload = {
  kind: 'payment' as const,
  paymentId: 'mock_pay_1',
  amountOre: 312500,
  exp: Date.parse('2027-01-01T00:00:00Z'),
};

describe('mock provider signing', () => {
  it('round-trips a token and rejects tampering and expiry', () => {
    const token = encodeToken(payload, 'secret');
    expect(token).not.toContain('.');
    expect(decodeToken(token, 'secret', Date.parse('2026-12-01'))).toEqual(payload);
    expect(decodeToken(token, 'other-secret', Date.parse('2026-12-01'))).toBeNull();
    expect(decodeToken(token, 'secret', Date.parse('2027-01-02'))).toBeNull();

    const [body, signature] = token.split('~');
    const forged = Buffer.from(JSON.stringify({ ...payload, amountOre: 1 })).toString('base64url');
    expect(decodeToken(`${forged}~${signature}`, 'secret', 0)).toBeNull();
    expect(decodeToken(`${body}`, 'secret', 0)).toBeNull();
  });

  it('verifies webhook signatures on the exact body', () => {
    const raw = JSON.stringify({ id: 'evt_1' });
    expect(verify(raw, sign(raw, 'secret'), 'secret')).toBe(true);
    expect(verify(`${raw} `, sign(raw, 'secret'), 'secret')).toBe(false);
    expect(verify(raw, null, 'secret')).toBe(false);
  });

  it('derives stable ids from keys', () => {
    expect(stableId('mock_pay', 'order-1')).toBe(stableId('mock_pay', 'order-1'));
    expect(stableId('mock_pay', 'order-1')).not.toBe(stableId('mock_pay', 'order-2'));
    expect(stableId('mock_pay', 'order-1')).toMatch(/^mock_pay_[0-9a-f]{24}$/);
  });
});
