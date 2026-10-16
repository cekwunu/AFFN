/** Sponsor assets (SPO-02): what may be uploaded, per kind. Shared by the form and the action. */
export const ASSET_KINDS = ['logo', 'banner', 'video', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** The bucket's limit (Supabase free plan: 50 MB per file). Larger videos are sent as a link. */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export const ASSET_TYPES: Record<AssetKind, readonly string[]> = {
  logo: ['image/svg+xml', 'image/png'],
  banner: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  other: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'],
};

export const assetMimeOk = (kind: string, mime: string) =>
  (ASSET_TYPES[kind as AssetKind] ?? []).includes(mime);
