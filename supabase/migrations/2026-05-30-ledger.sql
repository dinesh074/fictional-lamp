-- =====================================================================
-- Migration: tenant ledger with running balance.
-- Re-runnable.
-- =====================================================================

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  entry_date date not null default current_date,
  type text not null check (type in ('charge','payment','adjustment','store_purchase','refund')),
  reference_id uuid,
  reference_type text,
  amount numeric(12,2) not null,           -- signed: +charge, -payment
  balance_after numeric(14,2),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ledger_tenant_date
  on public.ledger_entries(tenant_id, entry_date desc, created_at desc);
create index if not exists idx_ledger_building_date
  on public.ledger_entries(building_id, entry_date desc);
create index if not exists idx_ledger_reference
  on public.ledger_entries(reference_type, reference_id);

-- Compute running balance per tenant on insert.
create or replace function public.ledger_set_balance()
returns trigger
language plpgsql
as $$
declare
  v_prev numeric(14,2);
begin
  select balance_after into v_prev
    from public.ledger_entries
   where tenant_id = new.tenant_id
     and (entry_date < new.entry_date
          or (entry_date = new.entry_date and created_at < coalesce(new.created_at, now())))
   order by entry_date desc, created_at desc
   limit 1;
  new.balance_after := coalesce(v_prev, 0) + new.amount;
  return new;
end;
$$;

drop trigger if exists trg_ledger_set_balance on public.ledger_entries;
create trigger trg_ledger_set_balance
  before insert on public.ledger_entries
  for each row execute function public.ledger_set_balance();

-- Auto-write ledger rows from payments.
create or replace function public.payments_to_ledger()
returns trigger
language plpgsql
as $$
declare
  v_building uuid;
begin
  if tg_op = 'INSERT' then
    select b.id into v_building
      from public.tenants t
      left join public.rooms r on r.id = t.room_id
      left join public.buildings b on b.id = r.building_id
     where t.id = new.tenant_id;

    insert into public.ledger_entries
      (tenant_id, building_id, entry_date, type, reference_id, reference_type, amount, notes)
    values
      (new.tenant_id, v_building, new.due_date, 'charge', new.id, 'payment',
       new.amount, 'Rent ' || to_char(new.period_month, 'Mon YYYY'));

    if new.status = 'paid' then
      insert into public.ledger_entries
        (tenant_id, building_id, entry_date, type, reference_id, reference_type, amount, notes)
      values
        (new.tenant_id, v_building, coalesce(new.paid_date, current_date), 'payment', new.id, 'payment',
         -new.amount, 'Payment received');
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if (old.status is distinct from new.status) and new.status = 'paid' then
      select b.id into v_building
        from public.tenants t
        left join public.rooms r on r.id = t.room_id
        left join public.buildings b on b.id = r.building_id
       where t.id = new.tenant_id;
      insert into public.ledger_entries
        (tenant_id, building_id, entry_date, type, reference_id, reference_type, amount, notes)
      values
        (new.tenant_id, v_building, coalesce(new.paid_date, current_date), 'payment', new.id, 'payment',
         -new.amount, 'Payment received');
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.ledger_entries where reference_type = 'payment' and reference_id = old.id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_payments_to_ledger_ins on public.payments;
create trigger trg_payments_to_ledger_ins
  after insert on public.payments
  for each row execute function public.payments_to_ledger();

drop trigger if exists trg_payments_to_ledger_upd on public.payments;
create trigger trg_payments_to_ledger_upd
  after update on public.payments
  for each row execute function public.payments_to_ledger();

drop trigger if exists trg_payments_to_ledger_del on public.payments;
create trigger trg_payments_to_ledger_del
  after delete on public.payments
  for each row execute function public.payments_to_ledger();

-- RLS
alter table public.ledger_entries enable row level security;

drop policy if exists ledger_select on public.ledger_entries;
create policy ledger_select on public.ledger_entries
  for select using (public.is_authenticated_staff());

drop policy if exists ledger_insert on public.ledger_entries;
create policy ledger_insert on public.ledger_entries
  for insert with check (public.is_authenticated_staff());

drop policy if exists ledger_update on public.ledger_entries;
create policy ledger_update on public.ledger_entries
  for update using (public.is_owner());

drop policy if exists ledger_delete on public.ledger_entries;
create policy ledger_delete on public.ledger_entries
  for delete using (public.is_owner());

