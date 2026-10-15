import { describe, expect, it } from 'vitest';
import { canAdvance, canCancel, KITCHEN_COLUMNS, minutesSince, NEXT_STATUS } from './status';

describe('order status rules', () => {
  it('advances one step at a time to collected', () => {
    expect(KITCHEN_COLUMNS.map((s) => NEXT_STATUS[s])).toEqual([
      'accepted',
      'preparing',
      'ready',
      'collected',
    ]);
    expect(canAdvance('new', 'accepted')).toBe(true);
    expect(canAdvance('new', 'ready')).toBe(false);
    expect(canAdvance('accepted', 'new')).toBe(false);
    expect(canAdvance('collected', 'new')).toBe(false);
    expect(canAdvance('pending_payment', 'new')).toBe(false);
  });

  it('cancels only orders still on the kitchen board', () => {
    expect(KITCHEN_COLUMNS.every(canCancel)).toBe(true);
    expect(canCancel('collected')).toBe(false);
    expect(canCancel('cancelled')).toBe(false);
    expect(canCancel('pending_payment')).toBe(false);
  });

  it('counts whole minutes since the order', () => {
    const now = new Date('2027-06-12T12:00:00Z');
    expect(minutesSince('2027-06-12T11:58:59Z', now)).toBe(1);
    expect(minutesSince('2027-06-12T12:00:30Z', now)).toBe(0);
    expect(minutesSince('2027-06-12T10:00:00Z', now)).toBe(120);
  });
});
