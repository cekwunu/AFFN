import localFont from 'next/font/local';

// Self-hosted from @fontsource-variable (SIL OFL). Latin subset includes æ ø å.
export const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

export const fraunces = localFont({
  src: '../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2',
  variable: '--font-fraunces',
  weight: '100 900',
  display: 'swap',
});
