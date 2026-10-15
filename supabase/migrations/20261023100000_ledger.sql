-- P12 Commission configuration and ledger (COM-01 … COM-03, PRD §5–6).
-- The postings follow src/lib/money/ledger.ts exactly; tests/db/ledger.test.ts compares them.

-- Ledger: paid order --------------------------------------------------------------------------
-- One balanced transaction per paid order, from the order's snapshotted commission (COM-02) and
-- the fee the PSP reported: Dr PSP clearing gross / Cr vendor payable (gross − platform fee) /
-- Cr commission revenue / Cr mva payable; Dr PSP fee expense / Cr PSP clearing. Idempotent.
create function private.post_order_ledger(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_tx uuid := gen_random_uuid();
  v_fee bigint;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  select * into v_order from public.orders where id = v_payment.order_id;
  if v_order.id is null or exists (
    select 1 from public.ledger_entries where payment_id = v_payment.id and entry_type = 'sale'
  ) then
    return;
  end if;
  v_fee := coalesce(v_order.commission_ore, 0) + coalesce(v_order.commission_mva_ore, 0);
  insert into public.ledger_entries (
    organization_id, event_id, transaction_id, entry_type, account, direction, amount_ore,
    vendor_id, order_id, payment_id, description
  )
  select v_payment.organization_id, v_payment.event_id, v_tx, l.entry_type::public.ledger_entry_type,
         l.account::public.ledger_account, l.direction::public.ledger_direction, l.amount,
         v_payment.vendor_id, v_order.id, v_payment.id, 'Order ' || v_order.order_code
    from (values
      ('sale', 'psp_clearing', 'debit', v_payment.amount_ore),
      ('sale', 'vendor_payable', 'credit', v_payment.amount_ore - v_fee),
      ('commission', 'commission_revenue', 'credit', coalesce(v_order.commission_ore, 0)),
      ('commission_mva', 'mva_payable', 'credit', coalesce(v_order.commission_mva_ore, 0)),
      ('psp_fee', 'psp_fee_expense', 'debit', coalesce(v_payment.psp_fee_ore, 0)),
      ('psp_fee', 'psp_clearing', 'credit', coalesce(v_payment.psp_fee_ore, 0))
    ) as l (entry_type, account, direction, amount)
   where l.amount > 0;
end;
$$;
revoke all on function private.post_order_ledger(uuid) from public;

-- Ledger: refund ------------------------------------------------------------------------------
-- Reverses the vendor's share, the commission and its mva pro rata (never edits): the fee
-- reversal splits into commission (half-up) and mva (the rest); a refund that completes the
-- order reverses exactly what is left. The PSP fee is not reversed: AFFN keeps that cost.
create function private.post_refund_ledger(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds;
  v_order public.orders;
  v_gross bigint;
  v_fee bigint;
  v_before_refunded bigint;
  v_before_commission bigint;
  v_before_mva bigint;
  v_left_commission bigint;
  v_left_mva bigint;
  v_commission bigint;
  v_mva bigint;
  v_tx uuid := gen_random_uuid();
begin
  select * into v_refund from public.refunds where id = p_refund_id;
  if v_refund.id is null or exists (
    select 1 from public.ledger_entries where refund_id = v_refund.id
  ) then
    return;
  end if;
  select * into v_order from public.orders where id = v_refund.order_id;
  select amount_ore into v_gross from public.payments where id = v_refund.payment_id;

  select coalesce(sum(amount_ore) filter (
           where entry_type = 'refund' and account = 'psp_clearing'), 0),
         coalesce(sum(amount_ore) filter (
           where entry_type = 'refund_commission_reversal' and account = 'commission_revenue'), 0),
         coalesce(sum(amount_ore) filter (
           where entry_type = 'refund_commission_reversal' and account = 'mva_payable'), 0)
    into v_before_refunded, v_before_commission, v_before_mva
    from public.ledger_entries
   where order_id = v_order.id;

  if v_refund.amount_ore <= 0 or v_before_refunded + v_refund.amount_ore > v_gross then
    raise exception 'Refund % exceeds what is left of order %', v_refund.id, v_order.id
      using errcode = 'check_violation';
  end if;

  v_left_commission := coalesce(v_order.commission_ore, 0) - v_before_commission;
  v_left_mva := coalesce(v_order.commission_mva_ore, 0) - v_before_mva;
  if v_before_refunded + v_refund.amount_ore = v_gross then
    v_commission := v_left_commission;
    v_mva := v_left_mva;
  else
    if v_refund.platform_fee_reversal_ore > v_left_commission + v_left_mva then
      raise exception 'Fee reversal of refund % exceeds what is left of the fee', v_refund.id
        using errcode = 'check_violation';
    end if;
    v_fee := coalesce(v_order.commission_ore, 0) + coalesce(v_order.commission_mva_ore, 0);
    v_commission := case when v_fee = 0 then 0
                         else least(v_left_commission,
                                    (v_refund.platform_fee_reversal_ore * v_order.commission_ore * 2
                                     + v_fee) / (v_fee * 2))
                    end;
    v_mva := v_refund.platform_fee_reversal_ore - v_commission;
    if v_mva > v_left_mva then
      v_commission := v_refund.platform_fee_reversal_ore - v_left_mva;
      v_mva := v_left_mva;
    end if;
  end if;

  insert into public.ledger_entries (
    organization_id, event_id, transaction_id, entry_type, account, direction, amount_ore,
    vendor_id, order_id, payment_id, refund_id, description
  )
  select v_refund.organization_id, v_refund.event_id, v_tx, l.entry_type::public.ledger_entry_type,
         l.account::public.ledger_account, l.direction::public.ledger_direction, l.amount,
         v_refund.vendor_id, v_order.id, v_refund.payment_id, v_refund.id,
         'Refund ' || v_order.order_code
    from (values
      ('refund', 'vendor_payable', 'debit', v_refund.amount_ore - v_commission - v_mva),
      ('refund_commission_reversal', 'commission_revenue', 'debit', v_commission),
      ('refund_commission_reversal', 'mva_payable', 'debit', v_mva),
      ('refund', 'psp_clearing', 'credit', v_refund.amount_ore)
    ) as l (entry_type, account, direction, amount)
   where l.amount > 0;
end;
$$;
revoke all on function private.post_refund_ledger(uuid) from public;

-- Posted in the same transaction as the payment or refund succeeding, whichever path records it
-- (webhook, checkout, kitchen cancellation).
create function private.ledger_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.post_order_ledger(new.id);
  return null;
end;
$$;
revoke all on function private.ledger_on_payment() from public;

create trigger payments_ledger after update of status on public.payments
  for each row when (new.status = 'succeeded' and old.status <> 'succeeded')
  execute function private.ledger_on_payment();

create function private.ledger_on_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.post_refund_ledger(new.id);
  return null;
end;
$$;
revoke all on function private.ledger_on_refund() from public;

create trigger refunds_ledger after update of status on public.refunds
  for each row when (new.status = 'succeeded' and old.status <> 'succeeded')
  execute function private.ledger_on_refund();

-- The PSP's own fee, as reported with the payment (AFFN's expense), recorded with the payment
-- result in one call. Wraps record_order_payment.
create function public.record_order_payment(
  p_provider public.payment_provider,
  p_provider_payment_id text,
  p_succeeded boolean,
  p_method public.payment_method,
  p_amount_ore bigint,
  p_platform_fee_ore bigint,
  p_reason text,
  p_psp_fee_ore bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_succeeded and p_psp_fee_ore is not null then
    if p_psp_fee_ore < 0 or p_psp_fee_ore > p_amount_ore then
      raise exception 'PSP fee % out of range', p_psp_fee_ore using errcode = 'check_violation';
    end if;
    update public.payments
       set psp_fee_ore = p_psp_fee_ore
     where provider = p_provider and provider_payment_id = p_provider_payment_id
       and status <> 'succeeded';
  end if;
  return public.record_order_payment(
    p_provider, p_provider_payment_id, p_succeeded, p_method, p_amount_ore, p_platform_fee_ore,
    p_reason
  );
end;
$$;
revoke all on function public.record_order_payment(
  public.payment_provider, text, boolean, public.payment_method, bigint, bigint, text, bigint
) from public, anon, authenticated;
grant execute on function public.record_order_payment(
  public.payment_provider, text, boolean, public.payment_method, bigint, bigint, text, bigint
) to service_role;

-- Commission rules (COM-01, COM-03) -------------------------------------------------------------
-- Organization Admins add rules (RLS); a rule takes effect now or later, never in the past, so
-- what was charged before can never be re-rated (past orders keep their snapshot anyway).
create function private.guard_commission_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.effective_from < now() - interval '5 minutes' then
    raise exception 'effective_from_past' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_commission_rule() from public;

create trigger commission_rules_guard before insert on public.commission_rules
  for each row execute function private.guard_commission_rule();

-- Balances and totals from the ledger -----------------------------------------------------------
-- Vendor balances per event (TRX): lifetime = what the vendor has earned net of refunds;
-- paid = payouts posted; in settlement = net payout of lines in a prepared, approved or releasing
-- settlement not yet paid; pending = the rest. Runs as the caller, so RLS applies.
create function public.vendor_balances(p_event_id uuid)
returns table (
  vendor_id uuid,
  lifetime_ore bigint,
  in_settlement_ore bigint,
  paid_ore bigint,
  pending_ore bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ledger as (
    select e.vendor_id,
           sum(case when e.direction = 'credit' then e.amount_ore else -e.amount_ore end)
             filter (where e.entry_type <> 'payout') as lifetime,
           coalesce(sum(e.amount_ore) filter (where e.entry_type = 'payout'
                                              and e.direction = 'debit'), 0) as paid
      from public.ledger_entries e
     where e.event_id = p_event_id and e.account = 'vendor_payable' and e.vendor_id is not null
     group by e.vendor_id
  ),
  settling as (
    select l.vendor_id, sum(l.net_payout_ore) as amount
      from public.settlement_lines l
      join public.settlements s on s.id = l.settlement_id
     where l.event_id = p_event_id and s.status in ('prepared', 'approved', 'releasing')
     group by l.vendor_id
  )
  select ledger.vendor_id,
         coalesce(ledger.lifetime, 0)::bigint,
         greatest(0, least(coalesce(settling.amount, 0),
                           coalesce(ledger.lifetime, 0) - ledger.paid))::bigint,
         ledger.paid::bigint,
         (coalesce(ledger.lifetime, 0) - ledger.paid
          - greatest(0, least(coalesce(settling.amount, 0),
                              coalesce(ledger.lifetime, 0) - ledger.paid)))::bigint
    from ledger
    left join settling on settling.vendor_id = ledger.vendor_id;
$$;

-- Event totals two ways, for the admin: from the ledger, and independently from payments,
-- orders (snapshotted fee) and refunds. They must agree to the øre. Commission and mva are split
-- out from the ledger only (refunds reverse the fee as one amount).
create function public.event_money_totals(p_event_id uuid)
returns table (
  source text,
  gross_ore bigint,
  refunded_ore bigint,
  platform_fee_ore bigint,
  commission_ore bigint,
  commission_mva_ore bigint,
  psp_fee_ore bigint,
  vendor_ore bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with l as (
    select
      coalesce(sum(amount_ore) filter (where entry_type = 'sale' and account = 'psp_clearing'), 0) as gross,
      coalesce(sum(amount_ore) filter (where entry_type = 'refund' and account = 'psp_clearing'), 0) as refunded,
      coalesce(sum(case when direction = 'credit' then amount_ore else -amount_ore end)
               filter (where account = 'commission_revenue'), 0) as commission,
      coalesce(sum(case when direction = 'credit' then amount_ore else -amount_ore end)
               filter (where account = 'mva_payable'), 0) as mva,
      coalesce(sum(amount_ore) filter (where account = 'psp_fee_expense'), 0) as psp_fee,
      coalesce(sum(case when direction = 'credit' then amount_ore else -amount_ore end)
               filter (where account = 'vendor_payable' and entry_type <> 'payout'), 0) as vendor
      from public.ledger_entries
     where event_id = p_event_id
  ),
  o as (
    select coalesce(sum(p.amount_ore), 0) as gross,
           coalesce(sum(o.platform_fee_ore), 0) as fee,
           coalesce(sum(p.psp_fee_ore), 0) as psp_fee
      from public.payments p
      join public.orders o on o.id = p.order_id
     where p.event_id = p_event_id and p.status = 'succeeded'
  ),
  r as (
    select coalesce(sum(amount_ore), 0) as refunded,
           coalesce(sum(platform_fee_reversal_ore), 0) as fee
      from public.refunds
     where event_id = p_event_id and status = 'succeeded'
  )
  select 'ledger', l.gross::bigint, l.refunded::bigint, (l.commission + l.mva)::bigint,
         l.commission::bigint, l.mva::bigint, l.psp_fee::bigint, l.vendor::bigint
    from l
  union all
  select 'orders', o.gross::bigint, r.refunded::bigint, (o.fee - r.fee)::bigint, null, null,
         o.psp_fee::bigint, (o.gross - r.refunded - (o.fee - r.fee))::bigint
    from o, r;
$$;

grant execute on function public.vendor_balances(uuid) to authenticated;
grant execute on function public.event_money_totals(uuid) to authenticated;
revoke all on function public.vendor_balances(uuid) from public, anon;
revoke all on function public.event_money_totals(uuid) from public, anon;
