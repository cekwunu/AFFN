import { describe, expect, it } from 'vitest';
import { portalProfileSchema } from './profile';

const base = {
  displayName: 'Mama Afrika',
  description: 'Nigeriansk hjemmelaget mat fra Lagos.',
  story: '',
  publicEmail: '',
  publicPhone: '',
  websiteUrl: '',
  instagramHandle: '',
  facebookUrl: '',
  tiktokHandle: '',
  cateringOffer: '',
};

describe('portalProfileSchema', () => {
  it('normalizes contact and social fields and leaves empty ones out', () => {
    const value = portalProfileSchema.parse({
      ...base,
      publicPhone: '400 00 001',
      publicEmail: 'HEI@Mama.no',
      instagramHandle: '@mama.afrika',
      offersCatering: 'on',
    });
    expect(value).toMatchObject({
      publicPhone: '+47 400 00 001',
      publicEmail: 'hei@mama.no',
      instagramHandle: 'mama.afrika',
      offersCatering: true,
      profilePublished: false,
    });
    expect(value.story).toBeUndefined();
    expect(value.websiteUrl).toBeUndefined();
  });

  it('reports invalid fields', () => {
    const result = portalProfileSchema.safeParse({
      ...base,
      publicPhone: '123',
      description: 'Kort',
    });
    expect(result.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['description', 'too_short'],
      ['publicPhone', 'phone'],
    ]);
  });
});
