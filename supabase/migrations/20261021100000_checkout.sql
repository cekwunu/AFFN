-- P10 QR storefront and checkout (QR-01 … QR-05).

-- Whether a participation can take orders right now (QR-04): approved, published, not paused,
-- payouts enabled, vendor profile public and the event published (not closed).
create function private.can_sell(p_event_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.event_vendors ev
      join public.vendors v on v.id = ev.vendor_id
      join public.events e on e.id = ev.event_id
     where ev.id = p_event_vendor_id
       and ev.status = 'approved' and ev.is_published and not ev.is_paused
       and ev.psp_account_status = 'eligible' and ev.psp_account_id is not null
       and v.profile_published and e.status = 'published'
  );
$$;
revoke all on function private.can_sell(uuid) from public;

-- The cart's lines priced from the products on sale at this participation: the vendor's own,
-- not archived, available (not sold out). Mva is included in the price, per line, half-up.
create function private.checkout_lines(p_event_vendor_id uuid, p_items jsonb)
returns table (
  product_id uuid, name text, price_ore bigint, mva_rate_bp integer, quantity integer,
  line_total bigint, line_mva bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.price_ore, p.mva_rate_bp, i.quantity,
         p.price_ore * i.quantity,
         case when p.mva_rate_bp = 0 then 0
              else (p.price_ore * i.quantity * p.mva_rate_bp * 2 + (10000 + p.mva_rate_bp))
                   / ((10000 + p.mva_rate_bp) * 2)
         end
    from jsonb_to_recordset(p_items) as i (product_id uuid, quantity integer)
    join public.event_vendors ev on ev.id = p_event_vendor_id
    join public.products p on p.id = i.product_id and p.vendor_id = ev.vendor_id
     and p.archived_at is null
    join public.product_availability a on a.product_id = p.id
     and a.event_vendor_id = ev.id and a.is_available
   where i.quantity between 1 and 20;
$$;
revoke all on function private.checkout_lines(uuid, jsonb) from public;

-- Creates an order (pending_payment), its lines and its pending payment in one transaction.
-- Server code prices the cart and works out the commission with src/lib/money; this function
-- checks everything again against the database, so a stale or forged cart is refused:
--  * every product is the vendor's, not archived and on sale (not sold out) at this event,
--  * prices and mva come from the products, line by line (mva included in the price, half-up),
--  * the total equals what the visitor was shown,
--  * the commission matches the rule (half-up), and its mva is 25 % (half-up).
create function public.create_order(
  p_event_vendor_id uuid,
  p_items jsonb,
  p_expected_total_ore bigint,
  p_commission_rule_id uuid,
  p_commission_ore bigint,
  p_commission_mva_ore bigint,
  p_customer_name text,
  p_pickup_note text,
  p_locale text,
  p_provider public.payment_provider
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.event_vendors;
  v_rule public.commission_rules;
  v_order_id uuid;
  v_token text;
  v_payment_id uuid;
  v_total bigint := 0;
  v_mva bigint := 0;
  v_lines integer;
  v_expected_commission bigint;
  v_item record;
begin
  select * into v_ev from public.event_vendors where id = p_event_vendor_id for share;
  if not found or not private.can_sell(p_event_vendor_id) then
    raise exception 'not_selling' using errcode = 'check_violation';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'invalid_cart' using errcode = 'check_violation';
  end if;

  select count(*), coalesce(sum(line_total), 0), coalesce(sum(line_mva), 0)
    into v_lines, v_total, v_mva from private.checkout_lines(v_ev.id, p_items);
  -- Every line must match a product on sale, and each product may appear once.
  if v_lines <> jsonb_array_length(p_items)
     or v_lines <> (select count(distinct l.product_id)
                      from private.checkout_lines(v_ev.id, p_items) l) then
    raise exception 'unavailable' using errcode = 'check_violation';
  end if;
  if v_total <> p_expected_total_ore then
    raise exception 'price_changed' using errcode = 'check_violation';
  end if;

  -- The commission rule must be in force for this organization and match the amounts.
  select * into v_rule from public.commission_rules
   where id = p_commission_rule_id and organization_id = v_ev.organization_id
     and effective_from <= now()
     and (event_id is null or event_id = v_ev.event_id)
     and (vendor_id is null or vendor_id = v_ev.vendor_id);
  if not found then
    raise exception 'commission_rule' using errcode = 'check_violation';
  end if;
  v_expected_commission :=
    case when v_rule.type = 'fixed' then 0
         else (v_total * v_rule.rate_bp * 2 + 10000) / 20000 end
    + case when v_rule.type = 'percentage' then 0 else v_rule.fixed_ore end;
  if p_commission_ore <> v_expected_commission
     or p_commission_mva_ore <> (p_commission_ore * 2500 * 2 + 10000) / 20000
     or p_commission_ore + p_commission_mva_ore > v_total then
    raise exception 'commission_mismatch' using errcode = 'check_violation';
  end if;

  insert into public.orders (
    organization_id, event_id, event_vendor_id, vendor_id, status, customer_name, pickup_note,
    locale, total_ore, mva_ore, commission_rule_id, commission_type, commission_rate_bp,
    commission_fixed_ore, commission_ore, commission_mva_ore, platform_fee_ore
  ) values (
    v_ev.organization_id, v_ev.event_id, v_ev.id, v_ev.vendor_id, 'pending_payment',
    nullif(trim(p_customer_name), ''), nullif(trim(p_pickup_note), ''),
    case when p_locale = 'en' then 'en' else 'nb' end, v_total, v_mva, v_rule.id, v_rule.type,
    v_rule.rate_bp, v_rule.fixed_ore, p_commission_ore, p_commission_mva_ore,
    p_commission_ore + p_commission_mva_ore
  ) returning id, tracking_token into v_order_id, v_token;

  for v_item in select * from private.checkout_lines(v_ev.id, p_items) loop
    insert into public.order_items (
      organization_id, event_id, order_id, vendor_id, product_id, product_name, unit_price_ore,
      quantity, mva_rate_bp, line_total_ore, mva_ore
    ) values (
      v_ev.organization_id, v_ev.event_id, v_order_id, v_ev.vendor_id, v_item.product_id,
      v_item.name, v_item.price_ore, v_item.quantity, v_item.mva_rate_bp, v_item.line_total,
      v_item.line_mva
    );
  end loop;

  insert into public.payments (
    organization_id, event_id, order_id, vendor_id, provider, amount_ore, platform_fee_ore,
    idempotency_key
  ) values (
    v_ev.organization_id, v_ev.event_id, v_order_id, v_ev.vendor_id, p_provider, v_total,
    p_commission_ore + p_commission_mva_ore, 'order-' || v_order_id
  ) returning id into v_payment_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'tracking_token', v_token,
    'payment_id', v_payment_id,
    'idempotency_key', 'order-' || v_order_id,
    'total_ore', v_total,
    'mva_ore', v_mva,
    'platform_fee_ore', p_commission_ore + p_commission_mva_ore,
    'psp_account_id', v_ev.psp_account_id,
    'organization_id', v_ev.organization_id
  );
end;
$$;

-- The provider's id for the payment, once created (one per payment, never changed).
create function public.attach_provider_payment(p_payment_id uuid, p_provider_payment_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments
     set provider_payment_id = p_provider_payment_id
   where id = p_payment_id
     and (provider_payment_id is null or provider_payment_id = p_provider_payment_id);
$$;

-- The visitor's email for a receipt copy (QR-05), given on the receipt page. Personal data.
create function public.set_receipt_email(p_tracking_token text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set customer_email = lower(trim(p_email))
   where tracking_token = p_tracking_token and paid_at is not null;
  return found;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_order(uuid, jsonb, bigint, uuid, bigint, bigint, text, text, text, public.payment_provider)',
    'public.attach_provider_payment(uuid, text)',
    'public.set_receipt_email(text, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
