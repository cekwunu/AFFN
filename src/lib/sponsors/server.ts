import 'server-only';
import { publicObjectUrl } from '@/lib/storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** Statuses of a sponsorship that AFFN has accepted (shown publicly, reported on). */
export const ACCEPTED = ['confirmed', 'invoiced', 'paid'] as const;

/** Active packages of an event for the public "Become a sponsor" page (SPO-01). */
export async function publicPackages(eventId: string) {
  const { data, error } = await createAdminClient()
    .from('sponsor_packages')
    .select(
      'id, name, tier, price_ore, description, deliverables, logo_level, qr_code_count, max_sponsors',
    )
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('tier')
    .order('price_ore', { ascending: false });
  if (error) throw error;
  return data;
}

/** Public URL of an approved logo in the public sponsor-media bucket. */
export const sponsorLogoUrl = (path: string) => publicObjectUrl('sponsor-media', path)!;

/**
 * Approved sponsor logos for the public site, grouped by the package's logo level (1 = largest).
 * Each links through the sponsor's tracked link (SPO-03) so clicks are counted.
 */
export async function publicSponsorLogos(eventId: string) {
  const { data, error } = await createAdminClient()
    .from('sponsorships')
    .select(
      `id, sponsor:sponsors!sponsorships_sponsor_id_fkey(id, name, logo_path),
       package:sponsor_packages!sponsorships_package_id_organization_id_fkey(logo_level, tier),
       links:tracked_links!tracked_links_sponsorship_id_organization_id_fkey(slug, kind)`,
    )
    .eq('event_id', eventId)
    .in('status', [...ACCEPTED]);
  if (error) throw error;
  const logos = data
    .filter((s) => s.sponsor?.logo_path)
    .map((s) => ({
      sponsorId: s.sponsor!.id,
      name: s.sponsor!.name,
      logoUrl: sponsorLogoUrl(s.sponsor!.logo_path!),
      level: s.package.logo_level,
      href: s.links.find((l) => l.kind === 'link')?.slug
        ? `/s/${s.links.find((l) => l.kind === 'link')!.slug}`
        : null,
    }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'nb'));
  const levels = [...new Set(logos.map((l) => l.level))];
  return levels.map((level) => ({ level, logos: logos.filter((l) => l.level === level) }));
}

/** One sponsor's public profile (approved sponsorship for the event), or null. */
export async function publicSponsor(eventId: string, sponsorId: string) {
  const { data } = await createAdminClient()
    .from('sponsorships')
    .select(
      `id, sponsor:sponsors!sponsorships_sponsor_id_fkey(id, name, logo_path, website_url),
       package:sponsor_packages!sponsorships_package_id_organization_id_fkey(name),
       links:tracked_links!tracked_links_sponsorship_id_organization_id_fkey(slug, kind)`,
    )
    .eq('event_id', eventId)
    .eq('sponsor_id', sponsorId)
    .in('status', [...ACCEPTED])
    .maybeSingle();
  if (!data?.sponsor) return null;
  const link = data.links.find((l) => l.kind === 'link');
  return {
    id: data.sponsor.id,
    name: data.sponsor.name,
    logoUrl: data.sponsor.logo_path ? sponsorLogoUrl(data.sponsor.logo_path) : null,
    packageName: data.package.name,
    href: link ? `/s/${link.slug}` : null,
  };
}

/**
 * A sponsorship with everything its pages need: package, deliverables, invoice, links with their
 * counts, and assets. Read under the user's RLS (the sponsor itself or event staff).
 */
export async function sponsorshipDetail(sponsorshipId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sponsorships')
    .select(
      `id, organization_id, event_id, sponsor_id, status, agreed_price_ore, notes, created_at,
       sponsor:sponsors!sponsorships_sponsor_id_fkey(id, name, legal_name, org_number, website_url, logo_path, contact_name, contact_email, contact_phone, invoice_email, invoice_address, invoice_reference),
       package:sponsor_packages!sponsorships_package_id_organization_id_fkey(id, name, price_ore, deliverables, logo_level, qr_code_count)`,
    )
    .eq('id', sponsorshipId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [deliverables, invoices, links, assets] = await Promise.all([
    supabase
      .from('sponsorship_deliverables')
      .select('id, position, title, status, note, delivered_at')
      .eq('sponsorship_id', sponsorshipId)
      .order('position'),
    supabase
      .from('sponsor_invoices')
      .select(
        'id, invoice_number, total_ore, mva_ore, subtotal_ore, status, issued_at, due_at, paid_at',
      )
      .eq('sponsorship_id', sponsorshipId),
    supabase
      .from('tracked_links')
      .select('id, kind, slug, label, target_url, qr_scans(count)')
      .eq('sponsorship_id', sponsorshipId)
      .order('kind') // enum order: QR codes first, then the link
      .order('label'),
    supabase
      .from('sponsor_assets')
      .select(
        'id, kind, file_name, storage_path, status, feedback, mime_type, byte_size, created_at, reviewed_at',
      )
      .eq('sponsorship_id', sponsorshipId)
      .order('created_at', { ascending: false }),
  ]);
  for (const r of [deliverables, invoices, links, assets]) if (r.error) throw r.error;
  return {
    ...data,
    deliverables: deliverables.data!,
    invoice: invoices.data![0] ?? null,
    links: links.data!.map((l) => ({
      ...l,
      hits: (l.qr_scans as unknown as { count: number }[])[0]?.count ?? 0,
    })),
    assets: assets.data!,
  };
}
export type SponsorshipDetail = NonNullable<Awaited<ReturnType<typeof sponsorshipDetail>>>;

/** The signed-in sponsor's sponsorship for an event (RLS: only their own). */
export async function mySponsorship(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('sponsorships')
    .select('id')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? sponsorshipDetail(data.id) : null;
}

/** Packages and sponsorships of an event for the admin (RLS: event staff). */
export async function adminSponsors(eventId: string) {
  const supabase = await createClient();
  const [packages, sponsorships] = await Promise.all([
    supabase
      .from('sponsor_packages')
      .select(
        'id, name, tier, price_ore, description, deliverables, logo_level, qr_code_count, max_sponsors, is_active',
      )
      .eq('event_id', eventId)
      .order('tier')
      .order('name'),
    supabase
      .from('sponsorships')
      .select(
        `id, status, agreed_price_ore, created_at, sponsor:sponsors!sponsorships_sponsor_id_fkey(name, org_number),
         package:sponsor_packages!sponsorships_package_id_organization_id_fkey(name, price_ore)`,
      )
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
  ]);
  if (packages.error) throw packages.error;
  if (sponsorships.error) throw sponsorships.error;
  return { packages: packages.data, sponsorships: sponsorships.data };
}
