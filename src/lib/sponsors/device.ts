/**
 * A coarse device type from the User-Agent header (SPO-03): the only thing recorded about a
 * scan or click besides its time. The header itself is never stored.
 */
export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'other';

export function deviceClass(userAgent: string | null | undefined): DeviceClass {
  const ua = userAgent ?? '';
  if (!ua.trim()) return 'other';
  if (/bot|crawler|spider|preview|curl|wget/i.test(ua)) return 'other';
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'mobile';
  if (/Windows NT|Macintosh|X11|Linux x86_64|CrOS/i.test(ua)) return 'desktop';
  return 'other';
}
