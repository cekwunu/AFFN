/** Namespaces used by client components on every page. */
export const CLIENT_NAMESPACES = [
  'Layout',
  'LocaleSwitcher',
  'Theme',
  'Shell',
  'Components',
] as const;

/**
 * Picks the namespaces client components need, so each page's HTML carries only those
 * messages instead of the whole catalogue (smaller pages on 4G).
 */
export function pickMessages<M extends Record<string, unknown>>(
  messages: M,
  namespaces: readonly string[] = CLIENT_NAMESPACES,
): M {
  return Object.fromEntries(
    Object.entries(messages).filter(([namespace]) => namespaces.includes(namespace)),
  ) as M;
}
