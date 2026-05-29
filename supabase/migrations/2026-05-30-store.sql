-- =====================================================================
-- Migration: store / POS (products + sales). Re-runnable.
-- =====================================================================

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  category text,
  unit text not null default 'pcs',
  cost_price numeric(10,2) not null default 0,
  sell_price numeric(10,2) not null default 0,
  stock_qty numeric(12,3) not null default 0,                  -- floats supported
  low_stock_threshold numeric(12,3) not null default 0,
  photo_url text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.store_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  sale_date date not null default current_date,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('cash','upi','ledger','card','other')) default 'cash',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.store_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.store_sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric(12,3) not null,
  unit_price numeric(10,2) not null,
  unit_cost numeric(10,2) not null default 0,
  line_total numeric(12,2) not null
);

create index if not exists idx_sale_items_sale on public.store_sale_items(sale_id);
create index if not exists idx_sale_items_product on public.store_sale_items(product_id);
create index if not exists idx_sales_date on public.store_sales(sale_date desc);
create index if not exists idx_sales_tenant on public.store_sales(tenant_id);

-- After item insert: decrement stock.
create or replace function public.store_item_after_insert()
returns trigger language plpgsql as $$
begin
  update public.products set stock_qty = stock_qty - new.qty where id = new.product_id;
  return new;
end; $$;

drop trigger if exists trg_store_item_ins on public.store_sale_items;
create trigger trg_store_item_ins
  after insert on public.store_sale_items
  for each row execute function public.store_item_after_insert();

-- After item delete (sale cancellation): restock.
create or replace function public.store_item_after_delete()
returns trigger language plpgsql as $$
begin
  update public.products set stock_qty = stock_qty + old.qty where id = old.product_id;
  return old;
end; $$;

drop trigger if exists trg_store_item_del on public.store_sale_items;
create trigger trg_store_item_del
  after delete on public.store_sale_items
  for each row execute function public.store_item_after_delete();

-- After sale insert: if charged to tenant ledger, post entry.
create or replace function public.store_sale_after_insert()
returns trigger language plpgsql as $$
declare v_building uuid;
begin
  if new.tenant_id is not null and new.payment_method = 'ledger' and new.total > 0 then
    select b.id into v_building
      from public.tenants t
      left join public.rooms r on r.id = t.room_id
      left join public.buildings b on b.id = r.building_id
     where t.id = new.tenant_id;
    insert into public.ledger_entries
      (tenant_id, building_id, entry_date, type, reference_id, reference_type, amount, notes)
    values
      (new.tenant_id, v_building, new.sale_date, 'store_purchase', new.id, 'store_sale',
       new.total, coalesce(new.notes, 'Store purchase'));
  end if;
  return new;
end; $$;

drop trigger if exists trg_store_sale_ins on public.store_sales;
create trigger trg_store_sale_ins
  after insert on public.store_sales
  for each row execute function public.store_sale_after_insert();

-- After sale delete: reverse the ledger entry.
create or replace function public.store_sale_after_delete()
returns trigger language plpgsql as $$
begin
  delete from public.ledger_entries where reference_type = 'store_sale' and reference_id = old.id;
  return old;
end; $$;

drop trigger if exists trg_store_sale_del on public.store_sales;
create trigger trg_store_sale_del
  after delete on public.store_sales
  for each row execute function public.store_sale_after_delete();

-- Storage bucket for product photos.
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "product-photos read"   on storage.objects;
drop policy if exists "product-photos write"  on storage.objects;
drop policy if exists "product-photos update" on storage.objects;
drop policy if exists "product-photos delete" on storage.objects;

create policy "product-photos read" on storage.objects
  for select using (bucket_id = 'product-photos');
create policy "product-photos write" on storage.objects
  for insert with check (bucket_id = 'product-photos' and public.is_authenticated_staff());
create policy "product-photos update" on storage.objects
  for update using (bucket_id = 'product-photos' and public.is_authenticated_staff());
create policy "product-photos delete" on storage.objects
  for delete using (bucket_id = 'product-photos' and public.is_owner());

-- RLS for tables.
alter table public.products enable row level security;
alter table public.store_sales enable row level security;
alter table public.store_sale_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['products','store_sales','store_sale_items'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_authenticated_staff());', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_authenticated_staff());', t);
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_authenticated_staff());', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s;', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_owner());', t);
  end loop;
end $$;

