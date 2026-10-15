import { requireSupabasePublicConfig } from '@/lib/env';

/** Public URL of an object in a public Storage bucket (vendor-media, event-media). */
export function publicObjectUrl(bucket: 'vendor-media' | 'event-media', path: string | null) {
  if (!path) return null;
  return `${requireSupabasePublicConfig().url}/storage/v1/object/public/${bucket}/${path}`;
}
