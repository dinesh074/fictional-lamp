-- =====================================================================
-- Hostel/PG Management - Supabase Schema
-- Run this in the Supabase SQL Editor (project > SQL > New query)
-- =====================================================================

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- =====================================================================
-- PROFILES (linked to auth.users)
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  role text not null check (role in ('owner','manager')) default 'manager',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- BUILDINGS
-- =====================================================================
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- ROOMS
-- =====================================================================
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  room_number text not null,
  capacity int not null default 1,
  monthly_rent numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (building_id, room_number)
);

-- =====================================================================
-- TENANTS
-- =====================================================================
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  name text not null,
  phone text,
  email text,
  aadhar text,
  pan text,
  gst_number text,
  emergency_contact text,
  check_in_date date,
  check_out_date date,
  status text not null check (status in ('active','inactive')) default 'active',
  created_at timestamptz not null default now()
);

-- =====================================================================
-- PAYMENTS
-- =====================================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  amount numeric(10,2) not null,
  period_month date not null, -- first day of the month being paid for
  due_date date not null,
  paid_date date,
  payment_mode text check (payment_mode in ('cash','upi','bank_transfer','card','other')),
  status text not null check (status in ('paid','pending','overdue')) default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_tenant on public.payments(tenant_id);
create index if not exists idx_payments_status on public.payments(status);
create index if not exists idx_payments_period on public.payments(period_month);

-- =====================================================================
-- INVOICES
-- =====================================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  invoice_number text not null unique,
  gst_details jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- SETTINGS (single row)
-- =====================================================================
create table if not exists public.settings (
  id int primary key default 1,
  hostel_name text default 'My Hostel',
  hostel_address text,
  hostel_gst text,
  hostel_pan text,
  hostel_phone text,
  hostel_email text,
  payment_due_day int not null default 5 check (payment_due_day between 1 and 28),
  invoice_prefix text default 'INV',
  invoice_counter int not null default 1,
  constraint single_row check (id = 1)
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- =====================================================================
-- TRIGGERS
-- =====================================================================
-- Auto-create profile on signup; first signup becomes owner
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
  v_role text;
begin
  select count(*) into v_count from public.profiles;
  if v_count = 0 then
    v_role := 'owner';
  else
    v_role := coalesce(new.raw_user_meta_data->>'role', 'manager');
  end if;

  insert into public.profiles (id, name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'phone',
    v_role
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mark overdue payments
create or replace function public.mark_overdue_payments()
returns void
language sql
as $$
  update public.payments
     set status = 'overdue'
   where status = 'pending'
     and due_date < current_date;
$$;

-- Daily cron at 01:00 UTC
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('mark-overdue-payments') where exists (
      select 1 from cron.job where jobname = 'mark-overdue-payments'
    );
    perform cron.schedule('mark-overdue-payments', '0 1 * * *', $cron$ select public.mark_overdue_payments(); $cron$);
  end if;
end $$;

-- =====================================================================
-- RLS POLICIES
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.rooms enable row level security;
alter table public.tenants enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;
alter table public.settings enable row level security;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_authenticated_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- PROFILES
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (public.is_authenticated_staff());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (public.is_owner() or id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (public.is_owner() or id = auth.uid());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (public.is_owner());

-- BUILDINGS / ROOMS / TENANTS / PAYMENTS / INVOICES
-- All staff can read; only owner can delete; owner+manager can insert/update.
do $$
declare t text;
begin
  foreach t in array array['buildings','rooms','tenants','payments','invoices'] loop
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

-- SETTINGS - all staff read, only owner write
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using (public.is_authenticated_staff());
drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings for update using (public.is_owner());
drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings for insert with check (public.is_owner());

