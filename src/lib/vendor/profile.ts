/** Business profile edited in the vendor portal (VIS-02): what guests see on the vendor page. */
import { z } from 'zod';
import { handleField, normalizePhone, optional, trimmed, urlField } from './application';

const flag = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

export const portalProfileSchema = z.object({
  displayName: trimmed(2, 80),
  description: trimmed(20, 600),
  story: optional(trimmed(1, 2000)),
  publicEmail: optional(z.email('email').trim().toLowerCase()),
  publicPhone: optional(
    z.string().transform((value, ctx) => {
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({ code: 'custom', message: 'phone' });
        return z.NEVER;
      }
      return phone;
    }),
  ),
  websiteUrl: urlField,
  instagramHandle: handleField,
  facebookUrl: urlField,
  tiktokHandle: handleField,
  offersCatering: flag,
  cateringOffer: optional(trimmed(1, 1000)),
  profilePublished: flag,
});

export const GALLERY_MAX = 8;
export const galleryAltSchema = z.string().trim().min(1, 'alt').max(200, 'too_long');
