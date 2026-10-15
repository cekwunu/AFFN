import 'server-only';
import { getMessages } from 'next-intl/server';

type ApplyMessages = (typeof import('../../../messages/nb.json'))['Apply'];

/** Error texts for the application forms (error code → text). */
export async function applyErrors(): Promise<Record<string, string>> {
  const messages = (await getMessages()) as unknown as { Apply: ApplyMessages };
  return messages.Apply.errors;
}
