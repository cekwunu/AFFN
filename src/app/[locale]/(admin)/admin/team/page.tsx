import { getMessages, getTranslations } from 'next-intl/server';
import { AuthForm } from '@/components/auth/auth-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { initRequestLocale } from '@/i18n/server';
import { currentOrganization, getCurrentUser } from '@/lib/auth/server';
import { formatDateOslo } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { inviteEventAdmin, revokeInvitation, revokeMembership } from './actions';

// Team: invite Event Admins, see members and open invitations, remove access (AUTH-03).
export default async function TeamPage({ params }: PageProps<'/[locale]/admin/team'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Admin.team');
  const tAuth = await getTranslations('Auth.common');
  const user = (await getCurrentUser())!;
  const organization = await currentOrganization();
  const isOrgAdmin = user.access.roles.some(
    (r) => r.org === organization.id && r.role === 'org_admin' && r.status === 'active',
  );

  if (!isOrgAdmin) {
    return (
      <div className="grid gap-4">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('onlyOrgAdmin')}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [members, invitations, events] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, user_id, role, created_at')
      .eq('organization_id', organization.id)
      .in('role', ['org_admin', 'event_admin'])
      .order('created_at'),
    supabase
      .from('invitations')
      .select('id, email, expires_at, events(name)')
      .eq('organization_id', organization.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('events')
      .select('id, name')
      .eq('organization_id', organization.id)
      .order('starts_at'),
  ]);

  // Member emails live in Auth; the page is only reachable by an Organization Admin.
  const admin = createAdminClient();
  const emails = new Map(
    await Promise.all(
      (members.data ?? []).map(async (m) => {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        return [m.user_id, data.user?.email ?? '—'] as const;
      }),
    ),
  );
  const catalogue = (await getMessages()) as unknown as {
    Admin: { team: { errors: Record<string, string> } };
  };
  const messages = { ...catalogue.Admin.team.errors, sent: t('sent') };

  return (
    <div className="grid max-w-4xl gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('intro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('inviteTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AuthForm
            action={inviteEventAdmin}
            fields={[
              {
                name: 'email',
                label: tAuth('email'),
                type: 'email',
                autoComplete: 'off',
                required: true,
              },
              {
                name: 'eventId',
                label: t('event'),
                type: 'select',
                options: [
                  { value: '', label: t('allEvents') },
                  ...(events.data ?? []).map((e) => ({ value: e.id, label: e.name })),
                ],
              },
              {
                name: 'inviteLocale',
                label: t('language'),
                type: 'select',
                defaultValue: locale,
                options: [
                  { value: 'nb', label: 'Norsk' },
                  { value: 'en', label: 'English' },
                ],
              },
            ]}
            submitLabel={t('submit')}
            workingLabel={tAuth('working')}
            messages={messages}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="pending-title" className="grid gap-3">
        <h2 id="pending-title" className="text-heading-md font-semibold">
          {t('pendingTitle')}
        </h2>
        {invitations.data?.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {invitations.data.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{invitation.email}</span>
                  <span className="text-body-sm text-muted-foreground">
                    {invitation.events?.name ? `${invitation.events.name} · ` : ''}
                    {t('expires', { date: formatDateOslo(invitation.expires_at, locale) })}
                  </span>
                </span>
                <form action={revokeInvitation}>
                  <input type="hidden" name="id" value={invitation.id} />
                  <button
                    type="submit"
                    className="cursor-pointer text-body-sm font-medium text-danger hover:underline"
                  >
                    {t('revokeInvite')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-muted-foreground">{t('noPending')}</p>
        )}
      </section>

      <section aria-labelledby="members-title" className="grid gap-3">
        <h2 id="members-title" className="text-heading-md font-semibold">
          {t('membersTitle')}
        </h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {(members.data ?? []).map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-medium">
                {emails.get(member.user_id)}
                {member.user_id === user.id && (
                  <span className="text-muted-foreground"> ({t('you')})</span>
                )}
              </span>
              <Badge variant={member.role === 'org_admin' ? 'primary' : 'secondary'}>
                {t(`roles.${member.role as 'org_admin' | 'event_admin'}`)}
              </Badge>
              {member.role === 'event_admin' && (
                <form action={revokeMembership}>
                  <input type="hidden" name="id" value={member.id} />
                  <button
                    type="submit"
                    className="cursor-pointer text-body-sm font-medium text-danger hover:underline"
                  >
                    {t('revoke')}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
