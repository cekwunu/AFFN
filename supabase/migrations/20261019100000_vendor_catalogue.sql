-- P08 vendor portal and catalogue (CAT-01 … CAT-03).

-- Display order: one order per vendor, used at every event (owner decision P08).
alter table public.products add column sort_order integer not null default 0;

-- Catering offer text shown on the public profile (VIS-02); offers_catering already exists.
alter table public.vendors add column catering_offer text
  check (catering_offer is null or length(catering_offer) <= 1000);
grant update (catering_offer) on public.vendors to authenticated;
grant select (catering_offer) on public.vendors to anon;

-- Mva on products (CAT-01): 0 % unless the vendor is mva-registered, then 15 % (food) or 25 %.
create function private.check_product_mva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mva_rate_bp not in (0, 1500, 2500) then
    raise exception 'Mva rate must be 0, 15 or 25 %%' using errcode = 'check_violation';
  end if;
  if new.mva_rate_bp <> 0 and not exists (
    select 1 from public.vendors v where v.id = new.vendor_id and v.mva_registered
  ) then
    raise exception 'Only mva-registered vendors charge mva' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger products_mva before insert or update of mva_rate_bp, vendor_id on public.products
  for each row execute function private.check_product_mva();

-- An archived product is taken off sale at every event (CAT-03).
create function private.unlist_archived_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    delete from public.product_availability where product_id = new.id;
  end if;
  return null;
end;
$$;
create trigger products_unlist_archived after update of archived_at on public.products
  for each row execute function private.unlist_archived_product();

-- Product changes (prices, mva, archive, delete) are audited.
create trigger products_audit after insert or update or delete on public.products
  for each row execute function private.audit_change();

-- Delete (CAT-03): only products no order refers to; otherwise they can only be archived. The
-- order_items foreign key (on delete restrict) stays the backstop.
create function private.delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found or not (
    v_product.vendor_id = any (private.my_vendor_ids())
    or private.is_org_admin(v_product.organization_id)
  ) then
    raise exception 'Not your product' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.order_items oi where oi.product_id = p_product_id) then
    raise exception 'The product has been ordered; archive it instead'
      using errcode = 'foreign_key_violation';
  end if;
  delete from public.product_availability where product_id = p_product_id;
  delete from public.products where id = p_product_id;
end;
$$;
revoke all on function private.delete_product(uuid) from public;
grant execute on function private.delete_product(uuid) to authenticated;

create function public.delete_product(p_product_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_product(p_product_id);
$$;
revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;

-- Drag-and-drop order: sort_order follows the position in p_ids; only the vendor's own products.
create function private.reorder_products(p_vendor_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (p_vendor_id = any (private.my_vendor_ids())) then
    raise exception 'Not your catalogue' using errcode = 'insufficient_privilege';
  end if;
  update public.products p
     set sort_order = o.position
    from unnest(p_ids) with ordinality as o (id, position)
   where p.id = o.id and p.vendor_id = p_vendor_id and p.sort_order is distinct from o.position;
end;
$$;
revoke all on function private.reorder_products(uuid, uuid[]) from public;
grant execute on function private.reorder_products(uuid, uuid[]) to authenticated;

create function public.reorder_products(p_vendor_id uuid, p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.reorder_products(p_vendor_id, p_ids);
$$;
revoke all on function public.reorder_products(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_products(uuid, uuid[]) to authenticated;

-- Gallery (VIS-02): up to 8 images per vendor in the public vendor-media bucket.
create table public.vendor_gallery_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  storage_path text not null check (length(storage_path) between 1 and 300),
  alt_text text not null check (length(trim(alt_text)) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index vendor_gallery_images_organization_id_idx
  on public.vendor_gallery_images (organization_id);
create index vendor_gallery_images_vendor_id_idx on public.vendor_gallery_images (vendor_id);

create function private.limit_gallery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.vendor_gallery_images g where g.vendor_id = new.vendor_id) >= 8
  then
    raise exception 'A gallery holds at most 8 images' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger vendor_gallery_images_limit before insert on public.vendor_gallery_images
  for each row execute function private.limit_gallery();

alter table public.vendor_gallery_images enable row level security;
grant select, insert, update, delete on public.vendor_gallery_images to authenticated;
grant select (id, organization_id, vendor_id, storage_path, alt_text, sort_order)
  on public.vendor_gallery_images to anon;

create policy vendor_gallery_images_select on public.vendor_gallery_images
  for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_staff(organization_id)
    or private.staff_can_see_vendor(vendor_id)
  );
create policy vendor_gallery_images_insert on public.vendor_gallery_images
  for insert to authenticated
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_admin(organization_id)
  );
create policy vendor_gallery_images_update on public.vendor_gallery_images
  for update to authenticated
  using (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_admin(organization_id)
  )
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_admin(organization_id)
  );
create policy vendor_gallery_images_delete on public.vendor_gallery_images
  for delete to authenticated
  using (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_admin(organization_id)
  );
create policy vendor_gallery_images_public on public.vendor_gallery_images for select to anon
  using (private.vendor_is_public(vendor_id));
