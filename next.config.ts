import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Product, logo and gallery images come from Supabase Storage (public buckets) and are resized
// and re-encoded by next/image for the storefront (NFR-01).
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;
const localSupabase = !!supabase && ['127.0.0.1', 'localhost'].includes(supabase.hostname);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: supabase
      ? [
          {
            protocol: supabase.protocol.replace(':', '') as 'http' | 'https',
            hostname: supabase.hostname,
            port: supabase.port,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
    // Local development only: the local Supabase runs on 127.0.0.1.
    dangerouslyAllowLocalIP: localSupabase,
  },
};

export default withNextIntl(nextConfig);
