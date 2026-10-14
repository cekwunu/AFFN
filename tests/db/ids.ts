// Fixed ids from supabase/seed.sql and tests/db/fixtures.sql.
const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString().padStart(12, '0')}`;

export const USERS = {
  platformOwner: id('00000000', 1),
  orgAdmin: id('00000000', 2),
  eventAdmin: id('00000000', 3),
  vendor: id('00000000', 4),
  sponsor: id('00000000', 5),
  vendorOther: id('00000000', 11),
  sponsorOther: id('00000000', 12),
  eventAdminOther: id('00000000', 13),
  foreignAdmin: id('00000000', 14),
  orgAdmin2: id('00000000', 15),
} as const;

export const ORG1 = id('10000000', 1);
export const ORG2 = id('10000000', 2);
export const EVENT1 = id('20000000', 1); // AFFN 2027, published
export const EVENT2 = id('20000000', 2); // org 1, draft, assigned to eventAdminOther
export const EVENT3 = id('20000000', 3); // org 2
export const CATEGORY1 = id('30000000', 1);
export const VENDOR = (n: number) => id('40000000', n);
export const EVENT_VENDOR = (n: number) => id('41000000', n);
export const STALL = (n: number) => id('50000000', n);
export const PRODUCT = (n: number) => id('60000000', n);
export const COMMISSION_DEFAULT = id('70000000', 1);
export const SPONSOR = (n: number) => id('80000000', n);
export const PACKAGE = (n: number) => id('81000000', n);
export const SPONSORSHIP = (n: number) => id('82000000', n);
export const SETTLEMENT = (n: number) => id('96000000', n);

/** Row id in a fixture series: own = 1, other = 2, foreign = 11. */
export const row = (prefix: string, label: 'own' | 'other' | 'foreign') =>
  id(prefix, { own: 1, other: 2, foreign: 11 }[label]);
