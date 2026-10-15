import 'server-only';
import { getMessages } from 'next-intl/server';

type AuthMessages = (typeof import('../../../messages/nb.json'))['Auth'];
type Section = {
  [K in keyof AuthMessages]: AuthMessages[K] extends { errors: object } ? K : never;
}[keyof AuthMessages];

/** Error texts of an Auth form section (e.g. "signIn"), for the AuthForm island. */
export async function authErrors(section: Section): Promise<Record<string, string>> {
  const messages = (await getMessages()) as unknown as { Auth: AuthMessages };
  return messages.Auth[section].errors as Record<string, string>;
}
