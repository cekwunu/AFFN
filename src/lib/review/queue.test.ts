import { describe, expect, it } from 'vitest';
import { expiryWarning, matchesQueue, parseQueueFilters, type QueueRowLike } from './queue';

const row: QueueRowLike = {
  status: 'submitted',
  submittedAt: '2026-11-02T23:30:00Z', // 00:30 on 3 November in Oslo (UTC+1)
  vendorName: 'Mama Afrika Kjøkken',
  legalName: 'MAMA AFRIKA KJØKKEN AS',
  orgNumber: '923456783',
  category: 'hot-food',
  contactName: 'Ada Okafor',
  contactEmail: 'ada@example.no',
  documentsComplete: true,
};

describe('parseQueueFilters', () => {
  it('reads the URL and ignores invalid values', () => {
    expect(
      parseQueueFilters({
        q: ' mama ',
        status: 'submitted',
        documents: 'x',
        from: '2026-11-01',
        to: 'yesterday',
      }),
    ).toEqual({
      q: 'mama',
      status: 'submitted',
      category: null,
      documents: null,
      from: '2026-11-01',
      to: null,
    });
  });
});

describe('matchesQueue', () => {
  const f = parseQueueFilters({});

  it('searches name, org number and contact, ignoring case, spaces and accents', () => {
    expect(matchesQueue(row, { ...f, q: 'kjokken' })).toBe(true);
    expect(matchesQueue(row, { ...f, q: '923 456' })).toBe(true);
    expect(matchesQueue(row, { ...f, q: 'okafor' })).toBe(true);
    expect(matchesQueue(row, { ...f, q: 'jollof' })).toBe(false);
  });

  it('filters by status, category and documents', () => {
    expect(matchesQueue(row, { ...f, status: 'approved' })).toBe(false);
    expect(matchesQueue(row, { ...f, category: 'hot-food' })).toBe(true);
    expect(matchesQueue(row, { ...f, documents: 'missing' })).toBe(false);
    expect(matchesQueue({ ...row, documentsComplete: false }, { ...f, documents: 'missing' })).toBe(
      true,
    );
  });

  it('filters by the submitted day in Oslo time', () => {
    expect(matchesQueue(row, { ...f, from: '2026-11-03', to: '2026-11-03' })).toBe(true);
    expect(matchesQueue(row, { ...f, to: '2026-11-02' })).toBe(false);
    expect(matchesQueue({ ...row, submittedAt: null }, { ...f, from: '2026-01-01' })).toBe(false);
  });
});

describe('expiryWarning', () => {
  const today = new Date('2027-03-01T12:00:00Z');
  it('flags expired documents and documents that expire during the event', () => {
    expect(expiryWarning(null, '2027-06-13T20:00:00Z', today)).toBeNull();
    expect(expiryWarning('2027-02-28', '2027-06-13T20:00:00Z', today)).toBe('expired');
    expect(expiryWarning('2027-06-12', '2027-06-13T20:00:00Z', today)).toBe('beforeEvent');
    expect(expiryWarning('2027-06-13', '2027-06-13T20:00:00Z', today)).toBeNull();
  });
});
