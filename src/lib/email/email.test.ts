import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTokens } from '@/lib/design/tokens';
import { decisionEmail, invitationEmail } from './templates';
import { EMAIL_COLOUR_TOKENS, EMAIL_COLOURS } from './theme';

const tokens = parseTokens(
  readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8'),
);

describe('email theme', () => {
  it.each(Object.entries(EMAIL_COLOURS))('%s matches its design token', (name, value) => {
    expect(value).toBe(tokens.raw[EMAIL_COLOUR_TOKENS[name as keyof typeof EMAIL_COLOURS]]);
  });
});

describe('invitationEmail', () => {
  const base = {
    to: 'ny@affn.test',
    organizationName: 'African Food Festival Norway',
    eventName: 'AFFN 2027',
    inviterName: 'Ada',
    link: 'https://affn.example/invite/abc',
  };

  it('is written in bokmål for nb', () => {
    const email = invitationEmail({ ...base, locale: 'nb' });
    expect(email.subject).toContain('African Food Festival Norway');
    expect(email.text).toContain('AFFN 2027');
    expect(email.text).toContain(base.link);
    expect(email.html).toContain('lang="nb"');
    expect(email.text).toMatch(/invitert/i);
  });

  it('is written in English for en', () => {
    const email = invitationEmail({ ...base, locale: 'en' });
    expect(email.text).toMatch(/invited/i);
    expect(email.html).toContain('lang="en"');
  });

  it('escapes names in the HTML', () => {
    const email = invitationEmail({ ...base, locale: 'en', organizationName: '<b>Evil & Co</b>' });
    expect(email.html).not.toContain('<b>Evil');
    expect(email.html).toContain('&lt;b&gt;Evil &amp; Co&lt;/b&gt;');
  });
});

describe('decisionEmail', () => {
  const base = {
    to: 'ada@example.no',
    vendorName: 'Mama <Afrika>',
    eventName: 'AFFN 2027',
    note: 'Legg ved menyen.',
    link: 'https://affn.example/vendor/application',
  };

  it('sends the note with rejections and information requests, escaped', () => {
    const mail = decisionEmail({ ...base, locale: 'nb', decision: 'more_info_requested' });
    expect(mail.subject).toBe('Vi trenger mer informasjon – AFFN 2027');
    expect(mail.text).toContain('Melding fra AFFN:\nLegg ved menyen.');
    expect(mail.html).toContain('Mama &lt;Afrika&gt;');
    expect(decisionEmail({ ...base, locale: 'en', decision: 'rejected' }).text).toContain(
      'Message from AFFN:',
    );
  });

  it('keeps the note out of approvals and waitlisting', () => {
    const mail = decisionEmail({ ...base, locale: 'en', decision: 'approved' });
    expect(mail.subject).toBe('Your application to AFFN 2027 is approved');
    expect(mail.text).not.toContain('Legg ved menyen');
    expect(decisionEmail({ ...base, locale: 'nb', decision: 'waitlisted' }).html).not.toContain(
      'Legg ved menyen',
    );
  });
});
