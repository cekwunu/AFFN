// Reads emails caught by the local Mailpit server (Supabase CLI, port 54324).
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export interface CaughtEmail {
  subject: string;
  html: string;
  text: string;
}

/** Newest email to `to` (optionally whose subject contains `subject`), waiting for it to arrive. */
export async function waitForEmail(
  to: string,
  { subject, timeoutMs = 20_000 }: { subject?: string; timeoutMs?: number } = {},
): Promise<CaughtEmail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const match = messages.find((m) => !subject || m.Subject.includes(subject));
    if (match) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json();
      return { subject: message.Subject, html: message.HTML, text: message.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `No email to ${to}${subject ? ` about "${subject}"` : ''} within ${timeoutMs} ms`,
  );
}

/** First link in the email that contains `fragment`, with HTML entities decoded. */
export function linkFrom(email: CaughtEmail, fragment: string): string {
  const links = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) =>
    m[1]!.replaceAll('&amp;', '&'),
  );
  const link = links.find((href) => href.includes(fragment));
  if (!link) throw new Error(`No link containing ${fragment} in: ${links.join(', ')}`);
  return link;
}
