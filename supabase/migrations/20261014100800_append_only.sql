-- Append-only tables: block UPDATE, DELETE and TRUNCATE for every role (CLAUDE.md money rules).

do $$
declare
  t text;
begin
  foreach t in array array['ledger_entries', 'audit_log', 'psp_webhook_events', 'psp_webhook_attempts']
  loop
    execute format(
      'create trigger %I before update or delete on public.%I
         for each row execute function private.prevent_mutation()',
      t || '_append_only', t);
    execute format(
      'create trigger %I before truncate on public.%I
         for each statement execute function private.prevent_mutation()',
      t || '_no_truncate', t);
  end loop;
end;
$$;
