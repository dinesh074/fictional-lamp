-- =====================================================================
-- Migration: auto due-day flag + payment hold flag on tenants
-- Re-runnable.
-- =====================================================================

-- Auto-derive due day from check-in date (default true).
alter table public.tenants
  add column if not exists auto_due_day boolean not null default true;

-- Payment hold: skip reminders / mark visually.
alter table public.tenants
  add column if not exists payment_hold boolean not null default false;
alter table public.tenants
  add column if not exists payment_hold_reason text;
alter table public.tenants
  add column if not exists payment_hold_until date;

-- Backfill payment_due_day from check_in_date for rows that opted in.
update public.tenants
   set payment_due_day = least(28, extract(day from check_in_date)::int)
 where auto_due_day
   and check_in_date is not null
   and payment_due_day is null;

-- Helper: effective due day for a tenant (tenant override -> settings default).
create or replace function public.tenant_effective_due_day(p_tenant uuid)
returns int
language sql stable
as $$
  select coalesce(
    (select payment_due_day from public.tenants where id = p_tenant),
    (select payment_due_day from public.settings where id = 1),
    5
  );
$$;

-- Helper: tenant is currently on hold?
create or replace function public.tenant_is_on_hold(p_tenant uuid)
returns boolean
language sql stable
as $$
  select coalesce(
    (select payment_hold
       and (payment_hold_until is null or payment_hold_until >= current_date)
     from public.tenants where id = p_tenant),
    false
  );
$$;

