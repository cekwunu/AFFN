// Email clients ignore stylesheets and CSS variables, so emails need literal colours. They
// mirror the design tokens; theme.test.ts fails if they drift from src/styles/tokens.css.
export const EMAIL_COLOURS = {
  canvas: '#faf8f5', // sand-50
  ink: '#141110', // sand-950
  card: '#ffffff', // sand-0
  line: '#e7e0d6', // sand-200
  muted: '#6b6055', // sand-600
  primary: '#a3472b', // terracotta-600
  onPrimary: '#ffffff', // sand-0
} as const;

export const EMAIL_COLOUR_TOKENS: Record<keyof typeof EMAIL_COLOURS, string> = {
  canvas: 'sand-50',
  ink: 'sand-950',
  card: 'sand-0',
  line: 'sand-200',
  muted: 'sand-600',
  primary: 'terracotta-600',
  onPrimary: 'sand-0',
};
